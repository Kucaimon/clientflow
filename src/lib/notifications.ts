import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";

/**
 * Фоновые уведомления.
 *
 * Идемпотентность — обязательное свойство: cron запускается повторно, и без
 * «отметки о выдаче» каждый прогон добавлял бы по письму на задачу. Для
 * просрочек такой отметкой служит поле Task.overdueNotifiedAt, для due-soon —
 * наличие уведомления типа DUE_SOON по этой задаче.
 */

type Tx = typeof prisma | Prisma.TransactionClient;


export async function notify(
  tx: Tx,
  input: {
    workspaceId: string;
    userId: string;
    type: NotificationType;
    title: string;
    body?: string;
    href?: string;
    entityId?: string;
    actorId?: string;
  },
) {
  // Себе уведомление не нужно: «выполнено» своей задачи видно и так.
  if (input.actorId === input.userId) return;

  await tx.notification.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
    },
  });
}

/**
 * Задачи с дедлайном в пределах N часов (для утреннего письма).
 *
 * Уже отправленные отсекаем по Notification.entityId: отношение «задача →
 * её уведомления» в схеме намеренно не заведено (уведомление живёт после
 * удаления задачи), поэтому фильтр собирается двумя запросами.
 */
export async function findDueSoonTasks(hoursAhead = 24) {
  const now = new Date();
  const until = new Date(now.getTime() + hoursAhead * 3_600_000);

  const candidates = await prisma.task.findMany({
    where: {
      dueDate: { gt: now, lte: until },
      status: { notIn: ["DONE", "CANCELED"] },
      assigneeId: { not: null },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, workspaceId: true } },
    },
  });

  if (candidates.length === 0) return [];

  const alreadySent = await prisma.notification.findMany({
    where: { type: "DUE_SOON", entityId: { in: candidates.map((task) => task.id) } },
    select: { entityId: true },
  });
  const sent = new Set(alreadySent.map((row) => row.entityId));

  return candidates.filter((task) => !sent.has(task.id));
}

/** Просроченные задачи: отметку ставим один раз, дальше задача «пройдена». */
export async function findOverdueTasks() {
  return prisma.task.findMany({
    where: {
      dueDate: { lt: new Date() },
      status: { notIn: ["DONE", "CANCELED"] },
      overdueNotifiedAt: null,
      OR: [{ assigneeId: { not: null } }, { project: { managerId: { not: null } } }],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, workspaceId: true, managerId: true } },
    },
  });
}

export async function markOverdueNotified(taskIds: string[]) {
  if (taskIds.length === 0) return;
  await prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { overdueNotifiedAt: new Date() },
  });
}

/** Кому уходит письмо по просроченной задаче: исполнитель, иначе менеджер. */
export function overdueRecipient(task: {
  assigneeId: string | null;
  project: { managerId: string | null };
}): string | null {
  return task.assigneeId ?? task.project.managerId;
}

export type Recurrence = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export const RECURRENCE_DAYS: Record<Recurrence, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
};

export function nextOccurrence(from: Date, recurrence: Recurrence): Date {
  const next = new Date(from);
  if (recurrence === "MONTHLY") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }
  next.setDate(next.getDate() + RECURRENCE_DAYS[recurrence]);
  return next;
}

/**
 * Проекты, у которых пришло время создать регулярную задачу.
 *
 * Шаг считаем от самого nextRunAt, а не от «сегодня»: если cron лежал три дня,
 * задача всё равно должна выйти, а окно генерации не должно превратиться в
 * бесконечный цикл из догонающих задач.
 */
export async function findRecurringToGenerate(now = new Date()) {
  return prisma.project.findMany({
    where: { recurring: true, nextRunAt: { not: null, lte: now } },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      recurrence: true,
      nextRunAt: true,
      estimate: true,
      managerId: true,
      occurrence: true,
    },
    take: 100,
  });
}

/**
 * Генерация регулярных задач. Одна транзакция на проект: либо создана задача
 * и сдвинут следующий запуск, либо ничего — повторный cron не создаст дубль.
 */
export async function generateRecurringTasks(now = new Date()) {
  const projects = await findRecurringToGenerate(now);
  const created: Array<{ projectId: string; taskId: string; occurrence: number }> = [];

  for (const project of projects) {
    const recurrence = (project.recurrence ?? "WEEKLY") as Recurrence;
    const base = project.nextRunAt ?? now;
    const occurrence = project.occurrence + 1;
    const title = `${project.name} — ${occurrence}-й проход`;

    const task = await prisma.$transaction(async (tx) => {
      const row = await tx.task.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          title,
          status: "TODO",
          priority: "MEDIUM",
          estimate: project.estimate,
          reporterId: project.managerId,
          dueDate: nextOccurrence(base, recurrence),
        },
      });

      await tx.project.update({
        where: { id: project.id },
        data: {
          nextRunAt: nextOccurrence(base, recurrence),
          occurrence,
          lastGenTitle: title,
        },
      });

      await logActivity(tx, {
        workspaceId: project.workspaceId,
        userId: project.managerId ?? undefined,
        projectId: project.id,
        entityId: row.id,
        type: "task.created",
        meta: { title, href: `/tasks/${row.id}` },
      });

      return row;
    });

    if (project.managerId) {
      await notify(prisma, {
        workspaceId: project.workspaceId,
        userId: project.managerId,
        type: "TASK_UPDATED",
        title: "Создана регулярная задача",
        body: title,
        href: `/tasks/${task.id}`,
        entityId: task.id,
      });
    }

    created.push({ projectId: project.id, taskId: task.id, occurrence });
  }

  return created;
}

/**
 * Уведомление всем членам воркспейса, кроме инициатора (создан проект,
 * выставлен счёт). createdMany одним запросом: по одному на человека —
 * это N round-trip'ов внутри транзакции.
 */
export async function notifyMany(
  tx: Tx,
  input: {
    workspaceId: string;
    type: NotificationType;
    title: string;
    body?: string;
    href?: string;
    entityId?: string;
    actorId?: string;
    /** Только эти люди; пусто — весь воркспейс. */
    userIds?: string[];
  },
) {
  const recipients =
    input.userIds ??
    (
      await tx.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        select: { userId: true },
      })
    ).map((member) => member.userId);

  const targets = [...new Set(recipients)].filter((id) => id !== input.actorId);
  if (targets.length === 0) return;

  await tx.notification.createMany({
    data: targets.map((userId) => ({
      workspaceId: input.workspaceId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      entityId: input.entityId ?? null,
      actorId: input.actorId ?? null,
    })),
  });
}

/** Служебное имя для вызова из API: уведомление одному по ids. */
export const emitNotification = notify;
