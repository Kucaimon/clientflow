import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { clientUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/**
 * id из URL обязательно сверяется с воркспейсом: `update({ where: { id } })`
 * без этого принял бы чужой clientId и вернул чужие данные.
 */
async function loadClient(workspaceId: string, id: string) {
  const client = await prisma.client.findFirst({ where: { id, workspaceId } });
  if (!client) throw new AppError(ErrorCodes.NOT_FOUND, "Клиент не найден");
  return client;
}

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { clientId } = await params;

  const client = await prisma.client.findFirst({
    where: { id: clientId, workspaceId: access.workspace.id },
    include: {
      projects: {
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, status: true, budget: true, spent: true },
      },
      invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      contacts: true,
    },
  });
  if (!client) throw new AppError(ErrorCodes.NOT_FOUND, "Клиент не найден");
  void user;
  return ok(client);
});

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const { clientId } = await params;
  await loadClient(access.workspace.id, clientId);

  const body = await readJson(req, clientUpdateSchema);

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company,
      industry: body.industry,
      website: body.website,
      note: body.note,
    },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: client.id,
    type: "client.updated",
    meta: { title: client.name },
  });

  revalidatePath("/app/clients");
  revalidatePath(`/app/clients/${client.id}`);
  return ok(client);
});

/**
 * Удаление — архив, а не DELETE из базы: счета клиента должны оставаться,
 * пока по ним не закрыты расчёты. Полное удаление — только owner.
 */
export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { clientId } = await params;
  const client = await loadClient(access.workspace.id, clientId);

  if (client.archivedAt) {
    throw new AppError(ErrorCodes.CONFLICT, "Клиент уже в архиве");
  }

  // Удаление — это архив: клиент исчезает из активного списка, а проекты
  // остаются в базе. Оставить их без клиента нельзя, поэтому сначала
  // требуется закрыть проекты, а не «удалить всё вместе».
  const liveProjects = await prisma.project.count({
    where: { clientId: client.id, status: { not: "ARCHIVED" } },
  });
  if (liveProjects > 0) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      `У клиента есть активные проекты (${liveProjects}) — сначала перенесите или закройте их`,
    );
  }

  await prisma.client.update({
    where: { id: clientId },
    data: { archivedAt: new Date() },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: clientId,
    type: "client.archived",
    meta: { title: client.name },
  });

  revalidatePath("/app/clients");
  return noContent();
});
