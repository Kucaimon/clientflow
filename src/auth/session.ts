import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/errors";

const COOKIE_NAME = "cf_session";

/**
 * Сессия — opaque-токен в таблице Session, а не JWT: нужен мгновенный отзыв
 * доступа (logout удаляет запись), а проверять подпись без БД нам не нужно.
 */

function ttlMs(): number {
  const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
  return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
}

/** Роль — свойство воркспейса, поэтому в сессии её нет: один человек в разных
 * воркспейсах может быть то владельцем, то подрядчиком. */
export type SessionUser = { id: string; email: string; name: string };

async function setCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true, // доступ только серверу: XSS не украдёт сессию
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // защита от CSRF при этом сохраняет навигацию по ссылкам
    path: "/",
    expires: expiresAt,
  });
}

export async function createSession(userId: string): Promise<{ token: string; user: SessionUser }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs());

  await prisma.session.create({ data: { token, userId, expiresAt } });
  await setCookie(token, expiresAt);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true },
  });

  return { token, user };
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  store.delete(COOKIE_NAME);
}

/**
 * Текущий пользователь, один раз на запрос: layout, страница и компоненты
 * вызывают это многократно, а выборка должна быть одна.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    select: { expiresAt: true, user: { select: { id: true, email: true, name: true } } },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Протухшую запись вычищаем, иначе таблица сессий растёт бесконечно.
    await prisma.session.deleteMany({ where: { token } });
    return null;
  }

  return session.user;
});

/** Для API и Server Components: бросает 401, если пользователя нет. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError(ErrorCodes.UNAUTHORIZED, "Нужна авторизация");
  return user;
}
