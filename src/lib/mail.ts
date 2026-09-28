/**
 * Отправка почты.
 *
 * Конфигурация через SMTP_URL: если она не задана (разработка, CI), письмо
 * логируется и считается отправленным — иначе каждое действие в dev падает
 * из-за отсутствия сервера, а тесты приходится включать.
 */
export type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendMail(mail: Mail): Promise<void> {
  const url = process.env.SMTP_URL;

  if (!url) {
    console.info(`[mail:dev] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }

  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport(url);
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "ClientFlow <no-reply@clientflow.local>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}
