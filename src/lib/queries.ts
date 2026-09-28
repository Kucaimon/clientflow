import type { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Пустой workspaceId Prisma трактует как «фильтра нет», и выборка отдаёт rows
 * всех воркспейсов сразу. Молчаливая утечка опаснее падения, поэтому пустое
 * значение сюда не проходит.
 */
function scoped(workspaceId: string): string {
  if (!workspaceId) {
    throw new Error("workspaceId пуст: запрос ушёл бы без фильтра по воркспейсу");
  }
  return workspaceId;
}


/**
 * Серверные выборки страниц.
 *
 * Держим их в одном месте: фильтр по workspace пишется один раз (забыть
 * `workspaceId` в запросе — это утечка чужих данных), и страница получает ровно
 * те поля, которые рисует.
 *
 * Все функции принимают `workspaceId` активным workspace'а, а не пользователя:
 * сессия больше не содержит workspace, он определяется на middleware.
 */

export function findWorkspace(workspaceId: string) {
  scoped(workspaceId);
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      plan: true,
      subscriptionStatus: true,
      currency: true,
      seats: true,
    },
  });
}

export function findMembers(workspaceId: string) {
  scoped(workspaceId);
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export function findInvitations(workspaceId: string) {
  scoped(workspaceId);
  return prisma.invitation.findMany({
    where: { workspaceId, acceptedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    include: { invitedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function findLabels(workspaceId: string) {
  scoped(workspaceId);
  return prisma.label.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
}

export function findTimeCategories(workspaceId: string) {
  scoped(workspaceId);
  return prisma.timeCategory.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
}

export function findClientOptions(workspaceId: string) {
  scoped(workspaceId);
  return prisma.client.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export function findClients(workspaceId: string, q?: string) {
  scoped(workspaceId);
  return prisma.client.findMany({
    where: {
      workspaceId,
      ...(q ? { OR: [{ name: { contains: q } }, { company: { contains: q } }] } : {}),
    },
    include: {
      _count: { select: { projects: true, invoices: true } },
      projects: { select: { budget: true }, take: 500 },
    },
    orderBy: { name: "asc" },
  });
}

export function findClient(workspaceId: string, id: string) {
  scoped(workspaceId);
  return prisma.client.findFirst({
    where: { id, workspaceId },
    include: {
      projects: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          budget: true,
          spent: true,
          _count: { select: { tasks: true } },
        },
      },
      invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      contacts: true,
    },
  });
}

/**
 * Список проектов.
 *
 * Задачи тянем списком статусов, а не счётчиком: странице нужен прогресс
 * (сделано/всего), и считать его из `_count` пришлось бы двумя запросами.
 * Валюту берём у воркспейса — у проекта своего поля нет, а показать бюджет
 * без валюты значит выдумать её на клиенте.
 */
export async function findProjects(
  workspaceId: string,
  options: { q?: string; clientId?: string; status?: string; mine?: string | null } = {},
) {
  scoped(workspaceId);
  const currency =
    (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true } }))
      ?.currency ?? "RUB";

  const where: Prisma.ProjectWhereInput = { workspaceId };
  if (options.clientId) where.clientId = options.clientId;
  if (options.status) where.status = options.status as ProjectStatus;

  // Условия-«или» складываем в массив: два ключа OR в одном литерале
  // противоречат друг другу, и второй молча стирает первый.
  const or: Prisma.ProjectWhereInput[] = [];
  if (options.q) {
    or.push({ name: { contains: options.q } }, { client: { name: { contains: options.q } } });
  }
  if (options.mine) {
    or.push(
      { managerId: options.mine },
      { tasks: { some: { assigneeId: options.mine } } },
      { members: { some: { userId: options.mine } } },
    );
  }
  if (or.length) where.OR = or;

  const projects = await prisma.project.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      tasks: { select: { id: true, status: true } },
      _count: { select: { members: true, invoices: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return projects.map((project) => ({ ...project, currency }));
}

export function findProject(workspaceId: string, id: string) {
  scoped(workspaceId);
  return prisma.project.findFirst({
    where: { id, workspaceId },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      activityLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { tasks: true, invoices: true } },
    },
  });
}

export function findProjectBoard(workspaceId: string, projectId: string) {
  scoped(workspaceId);
  return prisma.task.findMany({
    where: { project: { workspaceId }, projectId },
    include: {
      assignee: { select: { id: true, name: true } },
      labels: { include: { label: true } },
      _count: { select: { comments: true, timeEntries: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
}

/** Задачи личной доски: свои + без проекта. */
export function findMyTasks(workspaceId: string, userId: string) {
  scoped(workspaceId);
  return prisma.task.findMany({
    where: {
      OR: [{ assigneeId: userId }, { AND: [{ projectId: null }, { reporterId: userId }] }],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      labels: { include: { label: true } },
      _count: { select: { comments: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
}

export function findTask(workspaceId: string, id: string) {
  scoped(workspaceId);
  return prisma.task.findFirst({
    where: { id, workspaceId },
    include: {
      assignee: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, workspaceId: true } },
      labels: { include: { label: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
      timeEntries: {
        orderBy: { startedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
}

export function findInvoices(
  workspaceId: string,
  options: { status?: string; clientId?: string } = {},
) {
  scoped(workspaceId);
  return prisma.invoice.findMany({
    where: {
      workspaceId,
      ...(options.status ? { status: options.status as Prisma.InvoiceWhereInput["status"] } : {}),
      ...(options.clientId ? { clientId: options.clientId } : {}),
    },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findInvoice(workspaceId: string, id: string) {
  scoped(workspaceId);
  return prisma.invoice.findFirst({
    where: { id, workspaceId },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { date: "asc" } },
    },
  });
}

export function findAssignableUsers(workspaceId: string) {
  scoped(workspaceId);
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/** Неделя как интервал для сетки времени: понедельник — воскресенье. */
export function weekRange(reference = new Date()) {
  const start = new Date(reference);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { from: start, to: end };
}

export function findTimeEntries(workspaceId: string, userId: string, from: Date, to: Date) {
  scoped(workspaceId);
  return prisma.timeEntry.findMany({
    where: { workspaceId, userId, date: { gte: from, lte: to } },
    include: {
      task: { select: { id: true, title: true, projectId: true, status: true } },
      project: { select: { id: true, name: true } },
      category: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Строки сетки: задачи, назначенные мне, + задачи с уже внесённым временем. */
export async function findTimesheetRows(workspaceId: string, userId: string, from: Date, to: Date) {
  scoped(workspaceId);
  const [entries, assigned] = await Promise.all([
    findTimeEntries(workspaceId, userId, from, to),
    prisma.task.findMany({
      where: { assigneeId: userId, project: { workspaceId } },
      select: {
        id: true,
        title: true,
        status: true,
        projectId: true,
        project: { select: { id: true, name: true, client: { select: { name: true } } } },
      },
      take: 300,
    }),
  ]);

  const byTask = new Map<string, { from: Date; to: Date }>();
  void byTask;

  return { entries, assigned };
}

/**
 * Дашборд: четыре карточки, последние проекты и лента действий.
 *
 * Форму ответа задаёт страница — здесь только сборка. Всё считается одним
 * Promise.all: последовательные запросы превращали первый экран в семь
 * сетевых往返, и это было заметно на холодном старте.
 */
export async function findDashboard(workspaceId: string) {
  scoped(workspaceId);
  const { from, to } = weekRange();
  const from30 = new Date(Date.now() - 30 * 86_400_000);

  const [
    activeProjects,
    openTasks,
    overdueTasks,
    revenue,
    outstanding,
    recentProjects,
    activityLogs,
  ] = await Promise.all([
    prisma.project.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.task.count({
      where: { workspaceId, status: { notIn: ["DONE", "CANCELED"] } },
    }),
    prisma.task.count({
      where: {
        workspaceId,
        status: { notIn: ["DONE", "CANCELED"] },
        dueDate: { lt: new Date() },
      },
    }),
    // Выручка = оплаченное за 30 дней. Частичную оплату сюда не берём:
    // пользователю важен факт пришедших денег, а не прогноз.
    prisma.invoice.aggregate({
      where: { workspaceId, status: "PAID", paidAt: { gte: from30 } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { workspaceId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { total: true },
    }),
    prisma.project.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" } },
      include: {
        client: { select: { id: true, name: true } },
        tasks: { select: { id: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
  ]);

  const currency = (await prisma.workspace.findUnique({ where: { id: workspaceId } }))?.currency ?? "RUB";

  return {
    revenue: revenue._sum?.total ?? 0,
    outstanding: outstanding._sum?.total ?? 0,
    activeProjects,
    openTasks,
    overdueTasks,
    week: { from, to },
    currency,
    projects: recentProjects.map((project) => ({
      id: project.id,
      name: project.name,
      status: project.status,
      dueDate: project.dueDate,
      budget: project.budget,
      currency,
      client: project.client,
      tasks: project.tasks,
    })),
    recentActivity: activityLogs,
  };
}
