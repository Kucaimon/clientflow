import { prisma } from "@/lib/prisma";
import { created, parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/auth/password";
import { createSession } from "@/auth/session";
import { ACTIVE_WORKSPACE_COOKIE } from "@/auth/workspace";
import { cookies } from "next/headers";
import { assertRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/audit";

/**
 * Регистрация = пользователь + воркспейс в одной транзакции.
 * Иначе остаётся аккаунт без воркспейса: он нигде не может работать, а
 * повторная регистрация с тем же email уже невозможна.
 */
export const POST = route(async (req) => {
  await assertRateLimit("register", req.headers.get("x-forwarded-for") ?? "local", 5);

  const { name, email, password, workspaceName } = await parseBody(registerSchema, req);
  // Воркспейс создаём сразу, иначе первый вход упирается в пустой экран.
  // Название можно не указывать — тогда берём имя человека.
  const wsName = workspaceName?.trim() || `${name} — workspace`;

  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    // Не различаем «есть/нет»: иначе по ответу перебирают базу пользователей.
    throw new AppError(ErrorCodes.CONFLICT, "Не удалось создать аккаунт");
  }

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: wsName,
        seats: 3,
        members: { create: { userId: createdUser.id, role: "OWNER" } },
      },
      select: { id: true, name: true },
    });

    await logActivity(tx, {
      workspaceId: workspace.id,
      userId: createdUser.id,
      entityId: workspace.id,
      type: "workspace.created",
      meta: { title: wsName },
    });

    return { ...createdUser, workspace };
  });

  const { token } = await createSession(user.id);
  (await cookies()).set(ACTIVE_WORKSPACE_COOKIE, "", { path: "/" });
  // Сессия ставится внутри createSession, активный воркспейс подставится
  // автоматически: он вычисляется из членств, а не из куки по умолчанию.
  void token;

  return created({
    user: { id: user.id, email, name },
    // Роль возвращается вместе с воркспейсом: у человека её нет, она
    // существует только в границах команды.
    workspace: { id: user.workspace.id, name: user.workspace.name, role: "OWNER" as const },
  });
});
