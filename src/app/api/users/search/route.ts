import { prisma } from "@/lib/prisma";
import { ok, readQuery, route } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { userSearchQuerySchema } from "@/lib/validation";

/**
 * Поиск исполнителей для назначения.
 *
 * Ищем строго по участникам активного воркспейса: список «всех пользователей
 * системы» был бы утечкой имён и почт.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(userSearchQuerySchema, req);

  const items = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: access.workspace.id,
      ...(query.q
        ? {
            user: {
              OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }],
            },
          }
        : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
    take: 20,
  });

  return ok(items);
});
