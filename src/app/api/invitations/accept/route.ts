import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ok, parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { ACTIVE_WORKSPACE_COOKIE, type Role } from "@/auth/workspace";
import { invitationAcceptSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";

/**
 * Принять приглашение.
 *
 * Привязку «токен → конкретный email» не проверяем: ссылка лежит в письме,
 * а человек мог войти в аккаунт с другой почтой. Проверяем срок, повторное
 * принятие и то, что место в команде ещё есть.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const { token } = await parseBody(invitationAcceptSchema, req);

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { id: true, name: true, seats: true } } },
  });

  if (!invitation) throw new AppError(ErrorCodes.NOT_FOUND, "Приглашение не найдено");
  if (invitation.acceptedAt) {
    throw new AppError(ErrorCodes.CONFLICT, "Приглашение уже принято");
  }
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Срок приглашения истёк");
  }

  const alreadyMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId: invitation.workspaceId, userId: user.id },
    select: { id: true },
  });
  if (alreadyMember) {
    throw new AppError(ErrorCodes.CONFLICT, "Вы уже в этой команде");
  }

  const taken = await prisma.workspaceMember.count({ where: { workspaceId: invitation.workspaceId } });
  if (taken >= invitation.workspace.seats) {
    throw new AppError(ErrorCodes.CONFLICT, "В воркспейсе закончились места");
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.create({
      data: {
        workspaceId: invitation.workspaceId,
        userId: user.id,
        role: invitation.role as Role,
      },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
    await logActivity(tx, {
      workspaceId: invitation.workspaceId,
      userId: user.id,
      entityId: invitation.id,
      type: "member.joined",
      meta: { email: user.email },
    });
  });

  // Только что принятый воркспейс становится активным: за этим человек и шёл.
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, invitation.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return ok({ workspaceId: invitation.workspaceId, name: invitation.workspace.name });
});
