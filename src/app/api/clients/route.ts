import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { clientCreateSchema, clientListQuerySchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/**
 * Клиенты воркспейса.
 *
 * Архивные не показываем списком: «архив» в этом продукте означает «работа
 * закончена», и в общей таблице такой клиент только мешает. При этом прямой
 * GET по id работает — история счетов должна оставаться доступной.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(clientListQuerySchema, req);

  const where = {
    workspaceId: access.workspace.id,
    archivedAt: query.archived ? { not: null } : null,
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q } },
            { company: { contains: query.q } },
            { industry: { contains: query.q } },
          ],
        }
      : {}),
  };

  const clients = await prisma.client.findMany({
    where,
    include: { _count: { select: { projects: true, invoices: true } } },
    orderBy: { name: "asc" },
  });

  return ok({ items: clients, total: clients.length });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const body = await parseBody(clientCreateSchema, req);

  const client = await prisma.client.create({
    data: {
      workspaceId: access.workspace.id,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company: body.company ?? null,
      industry: body.industry ?? null,
      website: body.website ?? null,
      note: body.note ?? null,
    },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: client.id,
    type: "client.created",
    meta: { title: client.name },
  });

  revalidatePath("/app/clients");
  return created({ client });
});
