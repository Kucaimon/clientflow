import { prisma } from "@/lib/prisma";
import { ok, parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getCurrentUser, requireUser } from "@/auth/session";
import { getActiveWorkspace } from "@/auth/workspace";
import { changePasswordSchema, profileUpdateSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/auth/password";

/** Проверка сессии для клиента: кто вошёл и какой воркспейс активен. */
export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ user: null });

  const workspace = await getActiveWorkspace(user);
  return ok({
    user,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          role: workspace.role,
          currency: workspace.currency,
          plan: workspace.plan,
        }
      : null,
  });
});

/** Смена имени и email. Пароль — отдельным маршрутом. */
export const PATCH = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(profileUpdateSchema, req);

  if (body.email && body.email !== user.email) {
    const busy = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true },
    });
    if (busy) throw new AppError(ErrorCodes.CONFLICT, "Такой email уже занят");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: body.name, email: body.email },
    select: { id: true, name: true, email: true },
  });

  return ok(updated);
});

/**
 * Смена пароля.
 *
 * Текущий пароль спрашиваем обязательно: иначе украденная сессия в чужом
 * браузере даёт полный контроль над аккаунтом молча, без следа.
 */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const body = await parseBody(changePasswordSchema, req);

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!account || !(await verifyPassword(body.currentPassword, account.passwordHash))) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Текущий пароль не подходит");
  }

  // Старые сессии не убиваем: пользователь сам сидит в этом браузере,
  // а другие устройства пусть перелогинятся по истечении срока сессии.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) },
  });

  return ok({ changed: true });
});
