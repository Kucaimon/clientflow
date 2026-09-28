import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { parseBody, route } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { hashToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mail";

/**
 * Восстановление пароля.
 *
 * Ответ всегда 202: существование аккаунта не должно проверяться этим эндпоинтом.
 * Письмо уходит только если пользователь найден.
 */
export const POST = route(async (req) => {
  const { email } = await parseBody(forgotPasswordSchema, req);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });

  if (user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        tokenHash: await hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendMail({
      to: email,
      subject: "Сброс пароля ClientFlow",
      text: `Ссылка для сброса: ${base}/reset-password?token=${token}\nОна действует час.`,
      html: `<p>Ссылка для сброса: <a href="${base}/reset-password?token=${token}">сбросить пароль</a>. Действует час.</p>`,
    });
  }

  return Response.json({ ok: true }, { status: 202 });
});
