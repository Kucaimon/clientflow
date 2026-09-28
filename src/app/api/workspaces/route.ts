import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { setActiveWorkspace } from "@/auth/workspace";
import { workspaceCreateSchema, paginationWithSearchSchema } from "@/lib/validation";
import { assertRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/audit";

/**
 * GET /api/workspaces — воркспейсы пользователя.
 * POST /api/workspaces — новый воркспейс; создатель становится владельцем.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const query = readQuery(paginationWithSearchSchema, req);

  const where = {
    userId: user.id,
    workspace: { deletedAt: null, ...(query.q ? { name: { contains: query.q } } : {}) },
  };

  const [rows, total] = await Promise.all([
    prisma.workspaceMember.findMany({
      where,
      include: {
        workspace: {
          include: { _count: { select: { members: true, projects: true, clients: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.workspaceMember.count({ where }),
  ]);

  return ok({
    items: rows.map((row) => ({
      ...row.workspace,
      role: row.role,
      counts: row.workspace._count,
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  // Один аккаунт не должен засорять базу десятками пустых воркспейсов.
  await assertRateLimit("workspace-create", user.id, 10);

  const body = await parseBody(workspaceCreateSchema, req);

  const workspace = await prisma.workspace.create({
    data: {
      name: body.name,
      currency: body.currency,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    include: { members: true },
  });

  await setActiveWorkspace(user.id, workspace.id);

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: workspace.id,
    type: "workspace.created",
    meta: { title: workspace.name },
  });

  return created({ ...workspace, role: "OWNER" });
});
