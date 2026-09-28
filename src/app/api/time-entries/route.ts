import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { timeEntryCreateSchema, timeEntryListQuerySchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

const ENTRY_INCLUDE = {
  user: { select: { id: true, name: true } },
  task: { select: { id: true, title: true, projectId: true } },
  project: { select: { id: true, name: true } },
} as const;

/**
 * Журнал времени.
 *
 * Фильтр идёт через задачу/проект, а не через `workspaceId` записи: время
 * могло быть заведено вручную, и тогда воркспейс у записи всё равно свой.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(timeEntryListQuerySchema, req);

  const where = {
    workspaceId: access.workspace.id,
    ...(query.userId ? { userId: query.userId } : {}),
    ...(query.projectId ? { projectId: query.projectId } : {}),
    ...(query.taskId ? { taskId: query.taskId } : {}),
    ...(query.billable === undefined ? {} : { billable: query.billable }),
    ...(query.from || query.to
      ? {
          date: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total, aggregated] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: [{ date: "desc" }, { startedAt: "desc" }],
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.timeEntry.count({ where }),
    prisma.timeEntry.aggregate({ where, _sum: { minutes: true } }),
  ]);

  return ok({
    items,
    total,
    page: query.page,
    perPage: query.perPage,
    totalMinutes: aggregated._sum.minutes ?? 0,
  });
});

/**
 * Запись времени.
 *
 * Минуты считаем на сервере из пары дата-время либо берём из `minutes`:
 * клиентская арифметика расходится с серверной на часовых поясах.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const body = await parseBody(timeEntryCreateSchema, req);

  const startedAt = body.startedAt ? new Date(body.startedAt) : new Date();
  const stoppedAt = body.endedAt ? new Date(body.endedAt) : null;

  if (stoppedAt && stoppedAt <= startedAt) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Конец раньше начала");
  }

  if (body.taskId) {
    const task = await prisma.task.findFirst({
      where: { id: body.taskId, workspaceId: access.workspace.id },
    });
    if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "Задача не найдена в этом воркспейсе");
  }
  if (body.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: body.projectId, workspaceId: access.workspace.id },
    });
    if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден в этом воркспейсе");
  }

  const minutes =
    body.minutes ??
    (stoppedAt ? Math.round((stoppedAt.getTime() - startedAt.getTime()) / 60_000) : 0);

  if (minutes <= 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Длительность должна быть больше нуля");
  }

  const duplicate = stoppedAt
    ? await prisma.timeEntry.findFirst({
        where: { userId: user.id, startedAt, stoppedAt, workspaceId: access.workspace.id },
        select: { id: true },
      })
    : null;
  if (duplicate) throw new AppError(ErrorCodes.CONFLICT, "Такой интервал уже записан");

  const entry = await prisma.timeEntry.create({
    data: {
      workspaceId: access.workspace.id,
      userId: user.id,
      taskId: body.taskId ?? null,
      projectId: body.projectId ?? null,
      categoryId: body.categoryId ?? null,
      date: body.date ? new Date(body.date) : startedAt,
      startedAt,
      stoppedAt,
      minutes,
      billable: body.billable,
      note: body.description ?? null,
    },
    include: ENTRY_INCLUDE,
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: entry.projectId,
    entityId: entry.id,
    type: "time.created",
    meta: { title: `${minutes} мин`, taskId: entry.taskId },
  });

  revalidatePath("/app/tasks");
  if (entry.projectId) revalidatePath(`/app/projects/${entry.projectId}`);
  return created(entry);
});
