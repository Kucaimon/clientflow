import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { taskUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";

const TASK_INCLUDE = {
  project: { select: { id: true, name: true, clientId: true } },
  assignee: { select: { id: true, name: true } },
  reporter: { select: { id: true, name: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
  comments: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  timeEntries: {
    orderBy: { date: "desc" as const },
    take: 50,
  },
} as const;

/** Задача вместе с проверкой воркспейса: id из чужого воркспейса = 404. */
async function load(id: string, workspaceId: string) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId } });
  if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "Задача не найдена");
  return task;
}

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { id } = await params;
  await load(id, access.workspace.id);

  const task = await prisma.task.findFirst({ where: { id }, include: TASK_INCLUDE });
  return ok({ ...task, labels: task?.labels.map((link) => link.label) ?? [] });
});

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;
  const task = await load(id, access.workspace.id);

  const body = await readJson(req, taskUpdateSchema);

  if (body.assigneeId) {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: body.assigneeId, workspaceId: access.workspace.id },
    });
    if (!member) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Исполнитель не из этой команды");
  }

  // Оптимистичная блокировка. Версию присылает только тот клиент, который
  // видел задачу (канбан), поэтому запрос без версии остаётся легитимным —
  // иначе любое перетаскивание начинало бы требовать лишнего поля.
  if (body.version !== undefined && body.version !== task.version) {
    throw new AppError(ErrorCodes.CONFLICT, "Задачу изменили до вас — обновите доску");
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      version: { increment: 1 },
      title: body.title,
      description: body.description ?? undefined,
      status: body.status,
      priority: body.priority,
      position: body.position,
      projectId: body.projectId === undefined ? undefined : body.projectId,
      assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId,
      estimate: body.estimate === undefined ? undefined : body.estimate,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
    },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  // Смена статуса и переназначение — два разных события в ленте.
  if (body.status && body.status !== task.status) {
    await logActivity(prisma, {
      workspaceId: access.workspace.id,
      userId: user.id,
      projectId: updated.projectId,
      entityId: updated.id,
      type: "task.status_changed",
      meta: { title: updated.title, from: task.status, to: updated.status },
    });
  } else {
    await logActivity(prisma, {
      workspaceId: access.workspace.id,
      userId: user.id,
      projectId: updated.projectId,
      entityId: updated.id,
      type: "task.updated",
      meta: { title: updated.title },
    });
  }

  if (body.assigneeId && body.assigneeId !== task.assigneeId && body.assigneeId !== user.id) {
    await notifyMany(prisma, {
      workspaceId: access.workspace.id,
      userIds: [body.assigneeId],
      type: "TASK_ASSIGNED",
      title: `Вам назначена задача «${updated.title}»`,
      href: updated.projectId ? `/app/projects/${updated.projectId}` : "/app/tasks",
      actorId: user.id,
      entityId: updated.id,
    });
  }

  revalidatePath("/app/tasks");
  if (updated.projectId) revalidatePath(`/app/projects/${updated.projectId}`);
  return ok(updated);
});

export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;
  const task = await load(id, access.workspace.id);

  // Удаление задачи с учтённым временем оставило бы часы без задачи: они
  // остались бы в проекте и в счёте, но объяснить, откуда взялись, было бы
  // нечем. Поэтому просим сначала снять или перенести треки.
  const tracked = await prisma.timeEntry.count({ where: { taskId: task.id } });
  if (tracked > 0) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      `По задаче учтено времени: ${tracked} записей — сначала удалите или перенесите их`,
    );
  }

  await prisma.task.delete({ where: { id: task.id } });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: task.id,
    type: "task.deleted",
    meta: { title: task.title },
  });

  revalidatePath("/app/tasks");
  if (task.projectId) revalidatePath(`/app/projects/${task.projectId}`);
  return noContent();
});
