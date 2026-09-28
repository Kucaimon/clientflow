import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * Публичный предпросмотр приглашения по токену.
 *
 * Страница «vasya приглашает в „Северный ветер“» показывается до входа,
 * поэтому доступ к ней не требует сессии. Данные минимальны: название
 * воркспейса и роль, без списка проектов и людей.
 */
export const GET = route(async (_req, { params }) => {
  const { token } = await params;

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true } },
    },
  });
  if (!invitation) throw new AppError(ErrorCodes.NOT_FOUND, "Приглашение не найдено");

  const expired = Boolean(invitation.expiresAt && invitation.expiresAt < new Date());
  if (expired) throw new AppError(ErrorCodes.GONE, "Срок приглашения истёк");
  if (invitation.acceptedAt) {
    throw new AppError(ErrorCodes.CONFLICT, "Приглашение уже принято");
  }

  return ok({
    workspace: invitation.workspace,
    invitedBy: invitation.invitedBy,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  });
});
