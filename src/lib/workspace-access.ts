/**
 * Доступ к воркспейсу, id которого пришёл из URL (а не из куки).
 *
 * Нужно админским эндпоинтам воркспейса: там id в path, поэтому «активный
 * воркспейс» как источник проверки не подходит — пользователь имеет право
 * смотреть любой свой воркспейс, а не только выбранный прямо сейчас.
 */
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/errors";
import { requireUser, type SessionUser } from "@/auth/session";
import { hasRole, type ActiveWorkspace, type Role } from "@/auth/workspace";

export type WorkspaceAccess = { user: SessionUser; workspace: ActiveWorkspace; role: Role };

export async function requireWorkspaceRole(
  workspaceId: string,
  minimum: Role = "MEMBER",
): Promise<WorkspaceAccess> {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.id },
    include: {
      workspace: { select: { id: true, name: true, currency: true, plan: true, deletedAt: true } },
    },
  });

  // Удалённый воркспейс недоступен, даже если строка членства ещё жива:
  // иначе «удалённое» остаётся читаемым по прямой ссылке.
  if (!membership || membership.workspace.deletedAt) throw notFound("Воркспейс не найден");

  const role = membership.role as Role;
  if (!hasRole(role, minimum)) throw forbidden("Недостаточно прав для этого воркспейса");

  return {
    user,
    role,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      role,
      currency: membership.workspace.currency,
      plan: membership.workspace.plan,
    },
  };
}
