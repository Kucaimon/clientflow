/**
 * Журнал действий.
 *
 * Пишем в той же транзакции, что и основное изменение: запись «счёт удалён»
 * без удалённого счёта — это журнал, который врёт. Поэтому первая колонка —
 * транзакционный клиент, а не prisma напрямую.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ACTIVITY_TYPES = [
  "workspace.created",
  "workspace.updated",
  "workspace.deleted",
  "client.created",
  "client.updated",
  "client.archived",
  "client.restored",
  "client.deleted",
  "project.created",
  "project.updated",
  "project.status_changed",
  "project.deleted",
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.deleted",
  "comment.created",
  "time.created",
  "time.updated",
  "time.deleted",
  "invoice.created",
  "invoice.updated",
  "invoice.sent",
  "invoice.paid",
  "invoice.voided",
  "invoice.deleted",
  "invoice.status_changed",
  "payment.created",
  "member.invited",
  "member.joined",
  "member.role_changed",
  "member.removed",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ActivityInput = {
  workspaceId: string;
  /** Пусто для событий планировщика: их никто не совершал руками. */
  userId?: string | null;
  projectId?: string | null;
  entityId: string;
  type: ActivityType;
  meta?: Record<string, unknown>;
};

type Db = Prisma.TransactionClient | typeof prisma;

export async function logActivity(db: Db, input: ActivityInput): Promise<void> {
  await db.activityLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      entityId: input.entityId,
      type: input.type,
      meta: input.meta ? JSON.stringify(input.meta) : "{}",
    },
  });
}

/** Лента активности воркспейса: кто, что и когда. */
export async function recentActivity(workspaceId: string, limit = 20) {
  return prisma.activityLog.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
