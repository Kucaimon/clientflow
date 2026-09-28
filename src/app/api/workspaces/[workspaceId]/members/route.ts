import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, route } from "@/lib/api";
import { inviteMemberSchema } from "@/lib/validation";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspace-access";
import { sendWorkspaceInviteEmail } from "@/lib/mailer";
import { logActivity } from "@/lib/audit";

type Params = { params: Promise<{ workspaceId: string }> };

export const GET = route(async (_req: Request, { params }: Params) => {
  const { workspace } = await requireWorkspaceRole((await params).workspaceId, "MEMBER");

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { role: "asc" },
  });

  return ok(members);
});

/**
 * Приглашение в команду.
 *
 * Участником человек становится только по ссылке из письма: аккаунт с
 * временным паролем означал бы, что кто-то другой заводит почту и сразу
 * получает доступ к чужим проектам. Поэтому здесь создаётся Invitation
 * с токеном и сроком, а членство появляется на шаге принятия.
 */
export const POST = route(async (req, { params }: Params) => {
  const { workspaceId } = await params;
  const { user, workspace } = await requireWorkspaceRole(workspaceId, "ADMIN");
  const body = await parseBody(inviteMemberSchema, req);

  const existingUser = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true },
  });
  if (existingUser) {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: workspace.id, userId: existingUser.id },
    });
    if (member) return ok({ invited: false, reason: "ALREADY_MEMBER" as const });
  }

  const open = await prisma.invitation.findFirst({
    where: {
      workspaceId: workspace.id,
      email: body.email,
      acceptedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (open) return ok({ invited: true, token: open.token, reused: true });

  const [taken, capacity] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId: workspace.id } }),
    prisma.workspace
      .findUnique({ where: { id: workspace.id }, select: { seats: true } })
      .then((row) => row?.seats ?? 0),
  ]);
  if (taken >= capacity) {
    throw new AppError(
      ErrorCodes.CONFLICT,
      `Все ${capacity} мест заняты — освободите место или увеличьте тариф`,
    );
  }

  const token = randomUUID();
  const invitation = await prisma.invitation.create({
    data: {
      workspaceId: workspace.id,
      email: body.email,
      role: body.role,
      token,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });

  await sendWorkspaceInviteEmail({
    email: body.email,
    workspaceName: workspace.name,
    inviterName: user.name,
    token,
  });

  await logActivity(prisma, {
    workspaceId: workspace.id,
    userId: user.id,
    entityId: invitation.id,
    type: "member.invited",
    meta: { email: body.email, role: body.role },
  });

  return created({ invited: true, token, email: body.email });
});
