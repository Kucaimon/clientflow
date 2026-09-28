import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { updateMemberSchema } from "@/lib/validation";
import { requireWorkspaceRole } from "@/lib/workspace-access";
import { logActivity } from "@/lib/audit";

const RANK = { OWNER: 3, ADMIN: 2, MEMBER: 1 } as const;
const rank = (role: string) => RANK[role as keyof typeof RANK] ?? 0;

/**
 * PATCH — роль участника.
 *
 * Правила порядка важны формальных: админ не может понизить другого админа,
 * а владелец не может остаться единственным ответственным — воркспейс без
 * владельца перестаёт управляться.
 */
export const PATCH = route(async (req, { params }) => {
  const { workspaceId, memberId } = await params;
  const { user, workspace } = await requireWorkspaceRole(workspaceId, "ADMIN");
  const body = await readJson(req, updateMemberSchema);

  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: workspace.id },
  });
  if (!target) throw new AppError(ErrorCodes.NOT_FOUND, "Участник не найден");
  if (target.userId === user.id) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Свою роль меняет владелец через передачу владения");
  }
  if (workspace.role !== "OWNER" && rank(target.role) >= rank(workspace.role)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Недостаточно прав для изменения этой роли");
  }

  if (target.role === "OWNER" && body.role !== "OWNER") {
    const owners = await prisma.workspaceMember.count({
      where: { workspaceId: workspace.id, role: "OWNER" },
    });
    if (owners <= 1) {
      throw new AppError(ErrorCodes.CONFLICT, "В воркспейсе должен остаться хотя бы один владелец");
    }
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: target.id },
    data: { role: body.role },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: target.id,
    type: "member.role_changed",
    meta: { title: updated.user.name, from: target.role, to: updated.role },
  });

  return ok(updated);
});

/**
 * DELETE — удаление участника.
 *
 * Данные человека не удаляются: задачи и время остаются, просто автор
 * перестает быть членом команды.
 */
export const DELETE = route(async (_req, { params }) => {
  const { workspaceId, memberId } = await params;
  const { user, workspace } = await requireWorkspaceRole(workspaceId, "ADMIN");

  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!target) throw new AppError(ErrorCodes.NOT_FOUND, "Участник не найден");
  if (target.role === "OWNER") {
    throw new AppError(ErrorCodes.CONFLICT, "Владельца нельзя удалить — сначала передайте владение");
  }
  if (workspace.role !== "OWNER" && rank(target.role) >= rank(workspace.role)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Недостаточно прав для удаления этого участника");
  }

  await prisma.workspaceMember.delete({ where: { id: target.id } });

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: target.id,
    type: "member.removed",
    meta: { title: target.user.name },
  });

  return noContent();
});
