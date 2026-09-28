import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { projectCreateSchema, projectListQuerySchema } from "@/lib/validation";
import { listProjects } from "@/lib/project-repo";
import { logActivity } from "@/lib/audit";

/**
 * GET /api/projects — список со скоупом и фильтрами.
 * POST /api/projects — создание; код генерируется воркспейсом, не клиентом.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(projectListQuerySchema, req);
  // listProjects уже отдаёт готовую страницу { items, total, page, perPage }:
  // оборачивать её второй раз — значит вложить items в items.
  return ok(await listProjects(access.workspace.id, query));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });

  const body = await parseBody(projectCreateSchema, req);

  const project = await prisma.project.create({
    data: {
      workspaceId: access.workspace.id,
      clientId: body.clientId,
      name: body.name,
      description: body.description ?? null,
      status: body.status,
      hourlyRate: body.hourlyRate ?? null,
      hoursBudget: body.hoursBudget ?? null,
      budget: body.budget ?? null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      billingType: body.billingType,
      recurring: body.recurring,
      recurrence: body.recurrence ?? null,
      managerId: user.id,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: project.id,
    type: "project.created",
    meta: { title: project.name },
  });

  return created({ project });
});
