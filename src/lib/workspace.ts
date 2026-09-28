/**
 * Гварды активного воркспейса для API.
 *
 * Тонкая прослойка над auth/workspace: роутам почти всегда нужен только id
 * воркспейса, а не весь объект, и не нужен редирект (в API редирект бессмыслен
 * — fetch его не следует). Возвращаем строку, чтобы `where: { workspaceId }`
 * собирался без `.id` в каждом роуте.
 *
 * Проверка членства — внутри getActiveWorkspace: кука с чужим id не даёт доступ.
 */
import { requireUser, type SessionUser } from "@/auth/session";
import { activeWorkspaceOrThrow, getActiveWorkspace, hasRole, type Role } from "@/auth/workspace";
import { forbidden } from "@/lib/errors";

/** id активного воркспейса; 403, если воркспейса нет (пользователь не в онбординге). */
export async function requireActiveWorkspace(user?: SessionUser): Promise<string> {
  const current = user ?? (await requireUser());
  const workspace = await getActiveWorkspace(current);
  if (!workspace) throw forbidden("Сначала создайте воркспейс");
  return workspace.id;
}

/** То же, но с минимальной ролью — для mutating-роутов. */
export async function requireWorkspaceRole(minimum: Role, user?: SessionUser): Promise<string> {
  const workspace = await activeWorkspaceOrThrow({ minRole: minimum, user });
  return workspace.workspace.id;
}

export const requireMember = (user?: SessionUser) => requireWorkspaceRole("MEMBER", user);
export const requireAdmin = (user?: SessionUser) => requireWorkspaceRole("ADMIN", user);
export const requireOwner = (user?: SessionUser) => requireWorkspaceRole("OWNER", user);

export { hasRole };
