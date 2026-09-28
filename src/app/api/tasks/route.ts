import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";

/**
 * Задачи.
 *
 * Список фильтруется по воркспейсу всегда; `mine=1` сужает до исполнителя,
 * `projectId` — до доски проекта. Персональная доска — это задачи без проекта.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(taskListQuerySchema, req);

  const where: Record<string, unknown> = { workspaceId: access.workspace.id };
  if (query.projectId) where.projectId = query.projectId;
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.mine) where.assigneeId = user.id;
  if (query.open) where.status = { notIn: ["DONE", "CANCELED"] };
  if (query.q) where.title = { contains: query.q };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      labels: { include: { label: { select: { id: true, name: true, color: true } } } },
      _count: { select: { comments: true, timeEntries: true } },
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    skip: (query.page - 1) * query.perPage,
    take: query.perPage,
  });

  const items = tasks.map((task) => ({
    ...task,
    labels: task.labels.map((link) => link.label),
  }));
  return ok({ items, total: items.length });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const body = await parseBody(taskCreateSchema, req);

  // Проект задачи обязан принадлежать тому же воркспейсу: иначе задача
  // «переезжает» в чужую работу через подставленный projectId.
  if (body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, workspaceId: access.workspace.id },
    });
    if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден");
  }
  if (body.assigneeId) {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: body.assigneeId, workspaceId: access.workspace.id },
    });
    if (!member) throw new AppError(ErrorCodes.VALIDATION_ERROR, "Исполнитель не из этой команды");
  }

  // В колонке новые задачи становятся последними.
  const last = await prisma.task.findFirst({
    where: {
      workspaceId: access.workspace.id,
      status: body.status,
      ...(body.projectId ? { projectId: body.projectId } : {}),
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      workspaceId: access.workspace.id,
      title: body.title,
      description: body.description ?? null,
      status: body.status,
      priority: body.priority,
      projectId: body.projectId ?? null,
      assigneeId: body.assigneeId ?? null,
      estimate: body.estimate ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      position: (last?.position ?? 0) + 1,
      reporterId: user.id,
    },
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: task.projectId,
    entityId: task.id,
    type: "task.created",
    meta: { title: task.title },
  });

  // Назначение на другого человека — это уведомление, а не только запись в БД.
  if (body.assigneeId && body.assigneeId !== user.id) {
    await notifyMany(prisma, {
      workspaceId: access.workspace.id,
      userIds: [body.assigneeId],
      type: "TASK_ASSIGNED",
      title: `Вам назначена задача «${task.title}»`,
      href: `/app/projects/${task.projectId ?? ""}`,
      actorId: user.id,
      entityId: task.id,
    });
  }

  revalidatePath("/app/tasks");
  if (task.projectId) revalidatePath(`/app/projects/${task.projectId}`);
  return created({ task });
});
