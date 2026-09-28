import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { noContent, ok, parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow, type Role } from "@/auth/workspace";
import { projectUpdateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/**
 * Один проект.
 *
 * Чужой id отдаёт 404, а не 403: 403 подтверждает существование проекта,
 * а это утечка факта «такая работа ведётся».
 */
async function load(id: string, minRole: Role) {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole, user });
  const project = await prisma.project.findFirst({
    where: { id, workspaceId: access.workspace.id },
  });
  if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден");
  return { access, project };
}

export const GET = route(async (_req, { params }) => {
  const { id } = await params;
  const { project } = await load(id, "VIEWER");
  const detail = await prisma.project.findFirst({
    where: { id: project.id, workspaceId: project.workspaceId },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      _count: { select: { tasks: true, invoices: true, members: true } },
    },
  });
  return ok(detail);
});

export const PATCH = route(async (req, { params }) => {
  const { id } = await params;
  const { access, project } = await load(id, "MEMBER");

  const body = await parseBody(projectUpdateSchema, req);

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      name: body.name,
      description: body.description ?? undefined,
      status: body.status,
      hourlyRate: body.hourlyRate ?? undefined,
      hoursBudget: body.hoursBudget ?? undefined,
      budget: body.budget ?? undefined,
      billingType: body.billingType,
      recurring: body.recurring,
      recurrence: body.recurrence ?? undefined,
      clientId: body.clientId,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: access.user.id,
    projectId: project.id,
    entityId: updated.id,
    type: "project.updated",
    meta: { title: updated.name },
  });

  revalidatePath("/app/projects");
  revalidatePath(`/app/projects/${updated.id}`);
  return ok(updated);
});

/**
 * Удаление проекта.
 *
 * Проект со счетами удалять нельзя: счет — документ, и исчезнуть должна либо
 * работа, ещё не ставшая счётом, либо ничего. Такие проекты архивируются.
 */
export const DELETE = route(async (_req, { params }) => {
  const { id } = await params;
  const { access, project } = await load(id, "ADMIN");

  const invoiced = await prisma.invoice.count({ where: { projectId: project.id } });
  if (invoiced > 0) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      "По проекту есть счета — вместо удаления архивируйте его",
    );
  }

  await prisma.project.delete({ where: { id: project.id } });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: access.user.id,
    entityId: project.id,
    type: "project.deleted",
    meta: { title: project.name },
  });

  revalidatePath("/app/projects");
  return noContent();
});
