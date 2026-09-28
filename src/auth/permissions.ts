import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace, hasRole, type Role } from "./workspace";
import type { SessionUser } from "./session";

export type { Role };
export type EffectiveRole = Role | null;

/* -------------------------------- Проекты -------------------------------- */

/**
 * Видимость проекта.
 *
 * Сейчас проект виден всем членам воркспейса, а ProjectMember решает другую
 * задачу — «кто работает», то есть кто может брать его задачи и списывать время.
 * Если появится режим «только для команды проекта», порчаться будет это место,
 * и API-фильтр ниже должен измениться вместе с ним.
 */
export const canViewProject = cache(async function canViewProject(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { id: true },
  });
  return Boolean(member);
});

/** Фильтр для выборок проектов: всегда ограничен воркспейсом. */
export function projectScope(workspaceId: string): Prisma.ProjectWhereInput {
  return { workspaceId };
}

/** Может ли пользователь назначать задачи и править проект. */
export async function isProjectEditor(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return hasRole((membership?.role as Role) ?? null, "MEMBER");
}

/* --------------------------- Права по ролям ------------------------------ */

/** Задачи создаёт и двигает любой член воркспейса. */
export const canManageTasks = (role: EffectiveRole) => hasRole(role, "MEMBER");
export const canEditProject = (role: EffectiveRole) => hasRole(role, "MEMBER");
/** Назначать других и править чужие задачи — ADMIN. */
export const canAssignTasks = (role: EffectiveRole) => hasRole(role, "ADMIN");
export const canSeeFinance = (role: EffectiveRole) => hasRole(role, "ADMIN");
export const canManageClients = (role: EffectiveRole) => hasRole(role, "MEMBER");
export const canManageInvoices = (role: EffectiveRole) => hasRole(role, "ADMIN");
export const canManageTeam = (role: EffectiveRole) => hasRole(role, "ADMIN");
/** Удалить воркспейс или передать владение — только OWNER. */
export const canManageWorkspace = (role: EffectiveRole) => hasRole(role, "OWNER");

/** Роль пользователя в активном воркспейсе — то, что проверяют страницы и API. */
export async function getActiveRole(user: SessionUser): Promise<EffectiveRole> {
  const workspace = await getActiveWorkspace(user);
  return workspace?.role ?? null;
}

/**
 * Проверка «эта запись принадлежит моему воркспейсу».
 * Возвращаем строку-ошибку вместо исключения, чтобы route-слой сам выбирал код.
 */
export function assertSameWorkspace(
  row: { workspaceId: string } | null,
  workspaceId: string,
): asserts row is { workspaceId: string } {
  if (!row || row.workspaceId !== workspaceId) {
    throw new Error("NOT_IN_WORKSPACE");
  }
}
