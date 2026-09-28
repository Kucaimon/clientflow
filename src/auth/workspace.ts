import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getCurrentUser, requireUser, type SessionUser } from "./session";

export const ACTIVE_WORKSPACE_COOKIE = "cf_active_ws";

/**
 * Лестница прав.
 *
 * VIEWER — «смотреть, но не трогать»: его дают, чтобы показать воркспейс
 * новому человеку или подрядчику-наблюдателю. MANAGER отделён от MEMBER
 * намеренно: вести клиентов, проекты и счета — коммерческое решение,
 * а двигать задачи и писать время — рабочая операция. Отдельной таблицы
 * прав нет: порядок ролей покрывает все проверки в приложении.
 */
export type Role = "VIEWER" | "MEMBER" | "MANAGER" | "ADMIN" | "OWNER";

const ORDER: Record<Role, number> = { VIEWER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ORDER[role] >= ORDER[minimum];
}

export type ActiveWorkspace = {
  id: string;
  name: string;
  role: Role;
  currency: string;
  plan: string;
};

/** Воркспейсы пользователя с его ролью в каждом. */
export async function listWorkspacesForUser(
  userId: string,
): Promise<Array<ActiveWorkspace & { seats: number }>> {
  const rows = await prisma.workspaceMember.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true, currency: true, plan: true, seats: true } } },
  });

  return rows
    .filter((row) => row.workspace)
    .map((row) => ({
      id: row.workspace.id,
      name: row.workspace.name,
      role: row.role as Role,
      currency: row.workspace.currency,
      plan: row.workspace.plan,
      seats: row.workspace.seats,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Активный воркспейс: значение куки ПРОВЕРЯЕТСЯ на членство каждый раз.
 * Подставить в куку чужой id — не способ получить доступ.
 */
export const getActiveWorkspace = cache(async function getActiveWorkspace(
  user: SessionUser,
): Promise<ActiveWorkspace | null> {
  const list = await listWorkspacesForUser(user.id);
  if (list.length === 0) return null;

  const requested = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return (requested ? list.find((item) => item.id === requested) : undefined) ?? list[0]!;
});

/** Для страниц: нет воркспейса — нечего показывать, уводим на онбординг. */
export async function requireActiveWorkspace(user?: SessionUser): Promise<ActiveWorkspace> {
  const current = user ?? (await getCurrentUser());
  const workspace = current ? await getActiveWorkspace(current) : null;
  if (!workspace) redirect("/onboarding");
  return workspace;
}

/**
 * Для API: то же, но ошибкой, а не редиректом.
 *
 * minRole проверяется над активным воркспейсом: mutate-роуты просят MEMBER,
 * админские — ADMIN/OWNER. Явный user передают серверные компоненты, чтобы не
 * читать сессию второй раз за рендер.
 */
export async function activeWorkspaceOrThrow(options?: {
  minRole?: Role;
  user?: SessionUser;
}): Promise<{ user: SessionUser; workspace: ActiveWorkspace }> {
  const user = options?.user ?? (await requireUser());
  const workspace = await getActiveWorkspace(user);
  if (!workspace) throw new AppError(ErrorCodes.FORBIDDEN, "Нет активного воркспейса");

  if (options?.minRole && !hasRole(workspace.role, options.minRole)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Недостаточно прав для этого воркспейса");
  }

  return { user, workspace };
}

export async function activeWorkspaceId(): Promise<string> {
  const { workspace } = await activeWorkspaceOrThrow();
  return workspace.id;
}

/** Меняем активный воркспейс только после проверки членства. */
export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<boolean> {
  const list = await listWorkspacesForUser(userId);
  const target = list.find((item) => item.id === workspaceId);
  if (!target) return false;

  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

export async function workspaceMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Проверка доступа к конкретному воркспейсу по id из URL.
 *
 * Отдельная функция нужна для админских эндпоинтов (смена названия, участники,
 * удаление): там id приходит в path, а не из куки, поэтому activeWorkspaceOrThrow
 * не подходит. Куку при этом не трогаем — активный воркспейс меняется только
 * явным переключением.
 */
export async function requireWorkspaceMembership(
  workspaceId: string,
  minimum: Role = "MEMBER",
): Promise<{ user: SessionUser; workspace: ActiveWorkspace; membershipId: string }> {
  const user = await requireUser();

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: user.id },
    include: {
      workspace: {
        select: { id: true, name: true, currency: true, plan: true, seats: true, deletedAt: true },
      },
    },
  });

  // Удалённый воркспейс недоступен, даже если запись членства ещё жива.
  if (!membership || membership.workspace.deletedAt) {
    throw new AppError(ErrorCodes.NOT_FOUND, "Воркспейс не найден");
  }

  const role = membership.role as Role;
  if (!hasRole(role, minimum)) {
    throw new AppError(ErrorCodes.FORBIDDEN, "Недостаточно прав для управления воркспейсом");
  }

  return {
    user,
    membershipId: membership.id,
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      role,
      currency: membership.workspace.currency,
      plan: membership.workspace.plan,
    },
  };
}

/** Счётчик мест: расширение тарифа — привилегия владельца. */
export async function workspaceSeatCount(workspaceId: string) {
  return prisma.workspaceMember.count({ where: { workspaceId } });
}
