import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow, hasRole } from "@/auth/workspace";
import { timeEntryUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/**
 * Своя запись или админ воркспейса: править чужое время может только тот,
 * кто отвечает за биллинг, и это должно быть видно в журнале действий.
 */
async function load(id: string, workspaceId: string, userId: string, isAdmin: boolean) {
  const entry = await prisma.timeEntry.findFirst({ where: { id, workspaceId } });
  if (!entry) throw new AppError(ErrorCodes.NOT_FOUND, "Запись не найдена");
  if (entry.userId !== userId && !isAdmin) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Можно менять только своё время");
  }
  return entry;
}

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;
  const entry = await load(
      id,
      access.workspace.id,
      user.id,
      hasRole(access.workspace.role, "ADMIN"),
    );

  const body = await readJson(req, timeEntryUpdateSchema);

  const minutes =
    body.minutes ??
    (body.endedAt
      ? Math.round(
          (new Date(body.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000,
        )
      : undefined);

  if (minutes !== undefined && minutes <= 0) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Длительность должна быть больше нуля");
  }

  // Время, уже попавшее в счёт, трогать нельзя: счет становится неправдой.
  if (entry.invoiceId && (minutes !== undefined || body.billable !== undefined)) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      "Запись уже в счёте — сначала уберите её из счёта",
    );
  }

  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      minutes,
      billable: body.billable,
      note: body.description ?? undefined,
      stoppedAt: body.endedAt ? new Date(body.endedAt) : undefined,
      date: body.date ? new Date(body.date) : undefined,
    },
    include: {
      user: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: updated.projectId,
    entityId: updated.id,
    type: "time.updated",
    meta: { title: `${updated.minutes} мин` },
  });

  if (updated.projectId) revalidatePath(`/app/projects/${updated.projectId}`);
  return ok(updated);
});

export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;
  const entry = await load(
      id,
      access.workspace.id,
      user.id,
      hasRole(access.workspace.role, "ADMIN"),
    );

  if (entry.invoiceId) {
    throw new AppError(ErrorCodes.CONFLICT, "Запись уже в счёте — удалите её из счёта");
  }

  await prisma.timeEntry.delete({ where: { id: entry.id } });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: entry.projectId,
    entityId: entry.id,
    type: "time.deleted",
    meta: { title: `${entry.minutes} мин` },
  });

  if (entry.projectId) revalidatePath(`/app/projects/${entry.projectId}`);
  return noContent();
});
