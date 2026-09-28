import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { logActivity } from "@/lib/audit";

/**
 * Архив проекта.
 *
 * Отдельного поля archivedAt у проекта нет и не нужно: статус ARCHIVED уже
 * означает «работы нет», а второе поле неизбежно разошлось бы со статусом.
 */
export const POST = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, workspaceId: access.workspace.id },
  });
  if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден");
  if (project.status === "ARCHIVED") {
    throw new AppError(ErrorCodes.CONFLICT, "Проект уже в архиве");
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: project.id,
    entityId: project.id,
    type: "project.status_changed",
    meta: { title: project.name, from: project.status, to: "ARCHIVED" },
  });

  revalidatePath("/app/projects");
  return ok(updated);
});

/** Возврат из архива — обратно в ACTIVE, а не в «тот же статус, что был». */
export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, workspaceId: access.workspace.id },
  });
  if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден");
  if (project.status !== "ARCHIVED") {
    throw new AppError(ErrorCodes.CONFLICT, "Проект и так не в архиве");
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { status: "ACTIVE" },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    projectId: project.id,
    entityId: project.id,
    type: "project.status_changed",
    meta: { title: project.name, from: "ARCHIVED", to: "ACTIVE" },
  });

  revalidatePath("/app/projects");
  return ok(updated);
});
