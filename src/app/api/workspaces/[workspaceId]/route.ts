import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { ACTIVE_WORKSPACE_COOKIE, requireWorkspaceMembership } from "@/auth/workspace";
import { workspaceUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/** PATCH — название, валюта, автоаппрув времени. Роли: ADMIN и выше. */
export const PATCH = route(async (req, { params }) => {
  const { workspaceId } = await params;
  const { user, workspace } = await requireWorkspaceMembership(workspaceId, "ADMIN");
  const body = await readJson(req, workspaceUpdateSchema);

  const updated = await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      name: body.name,
      currency: body.currency,
    },
  });

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: workspace.id,
    type: "workspace.updated",
    meta: { title: updated.name },
  });

  revalidatePath("/", "layout");
  return ok(updated);
});

/**
 * Удаление воркспейса.
 *
 * Разрешаем только пустой: каскад удалил бы клиентов, проекты и счета,
 * а «я случайно удалил бухгалтерию за квартал» — слишком дорогая ошибка,
 * чтобы позволить её одним кликом.
 */
export const DELETE = route(async (_req, { params }) => {
  const { workspaceId } = await params;
  const { user, workspace } = await requireWorkspaceMembership(workspaceId, "OWNER");

  const [projects, clients, invoices] = await Promise.all([
    prisma.project.count({ where: { workspaceId: workspace.id } }),
    prisma.client.count({ where: { workspaceId: workspace.id } }),
    prisma.invoice.count({ where: { workspaceId: workspace.id } }),
  ]);

  if (projects + clients + invoices > 0) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      "В воркспейсе есть данные — сначала удалите или перенесите их",
    );
  }

  await prisma.workspace.delete({ where: { id: workspace.id } });

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: workspace.id,
    type: "workspace.deleted",
    meta: { title: workspace.name },
  });

  // Кура об активном воркспейсе больше не указывает никуда: пусть
  // приложение вернётся к первому доступному.
  (await cookies()).delete(ACTIVE_WORKSPACE_COOKIE);

  revalidatePath("/", "layout");
  return noContent();
});
