import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { commentCreateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/** Комментарий к задаче. Обсуждение живёт в задаче, а не в чате проекта. */
export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { id } = await params;

  const task = await prisma.task.findFirst({
    where: { id, workspaceId: access.workspace.id },
    select: { id: true },
  });
  if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "Задача не найдена");

  const comments = await prisma.taskComment.findMany({
    where: { taskId: task.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok(comments);
});

export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;

  const task = await prisma.task.findFirst({
    where: { id, workspaceId: access.workspace.id },
  });
  if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "Задача не найдена");

  const body = await readJson(req, commentCreateSchema);

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, userId: user.id, body: body.body },
    include: { user: { select: { id: true, name: true } } },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: task.projectId,
    entityId: task.id,
    type: "comment.created",
    meta: { title: task.title },
  });

  // Исполнику и автору задачи интересно новое обсуждение их задачи.
  const watchers = [task.assigneeId, task.reporterId].filter(
    (id2): id2 is string => Boolean(id2) && id2 !== user.id,
  );
  if (watchers.length) {
    await prisma.notification.createMany({
      data: [...new Set(watchers)].map((userId) => ({
        workspaceId: access.workspace.id,
        userId,
        type: "TASK_UPDATED" as const,
        title: `Новый комментарий к «${task.title}»`,
        body: body.body.slice(0, 120),
        href: task.projectId ? `/app/projects/${task.projectId}` : "/app/tasks",
        actorId: user.id,
        entityId: task.id,
      })),
    });
  }

  revalidatePath("/app/tasks");
  if (task.projectId) revalidatePath(`/app/projects/${task.projectId}`);
  return created(comment);
});
