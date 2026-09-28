import { prisma } from "@/lib/prisma";
import { parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/auth/password";
import { createSession } from "@/auth/session";
import { assertRateLimit } from "@/lib/rate-limit";

/**
 * Вход.
 *
 * Ответ одинаковый для «нет такого email» и «неверный пароль», и время ответа
 * тоже: иначе по ответу и по задержке перебирают существующие аккаунты.
 * Поэтому при неизвестном email всё равно выполняется сравнение с фейковым хешем.
 */
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpEqmgHc0LBc3HZUgqMlTaAh5ZL5G";

export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  await assertRateLimit("login", ip, 10);

  const { email, password } = await parseBody(loginSchema, req);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid) {
    throw new AppError(ErrorCodes.UNAUTHORIZED, "Неверный email или пароль");
  }

  await createSession(user.id);
  return Response.json({ id: user.id, email: user.email, name: user.name });
});
