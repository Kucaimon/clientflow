/**
 * Письма предметной области.
 *
 * Транспорт (SMTP/Resend/консоль) — в lib/mail; здесь только тексты и ссылки.
 * Разделение нужно, чтобы смена провайдера не трогала смысл писем.
 */
import { sendMail } from "@/lib/mail";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function inviteBody(input: {
  workspaceName: string;
  inviterName: string;
  token: string;
}): { subject: string; text: string; html: string } {
  const link = `${APP_URL()}/invite/${input.token}`;
  const subject = `${input.inviterName} приглашает вас в «${input.workspaceName}»`;
  const text = [
    `${input.inviterName} приглашает вас работать в воркспейсе «${input.workspaceName}».`,
    "",
    `Примкнуть: ${link}`,
    "",
    "Ссылка действует 7 дней. Если приглашение не вы — просто удалите письмо.",
  ].join("\n");

  return {
    subject,
    text,
    html: `<p>${escapeHtml(input.inviterName)} приглашает вас работать в воркспейсе <b>${escapeHtml(
      input.workspaceName,
    )}</b>.</p>
<p><a href="${link}">Примкнуть к воркспейсу</a></p>
<p style="color:#64748b">Ссылка действует 7 дней. Если приглашение не вам — удалите письмо.</p>`,
  };
}

export async function sendWorkspaceInviteEmail(input: {
  email: string;
  workspaceName: string;
  inviterName: string;
  token: string;
}): Promise<void> {
  const { subject, text, html } = inviteBody(input);
  await sendMail({ to: input.email, subject, text, html });
}


function invoiceBody(input: {
  clientName: string;
  number: string;
  total: number;
  currency: string;
  dueDate: Date | null;
}): { subject: string; text: string; html: string } {
  const sum = `${(input.total / 100).toLocaleString("ru-RU")} ${input.currency}`;
  const due = input.dueDate
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(input.dueDate)
    : null;
  const subject = `Счёт ${input.number}`;
  const text = [
    `${input.clientName}, вам выставлен счёт ${input.number} на сумму ${sum}.`,
    "",
    due ? `Оплатить до ${due}.` : "",
    "",
    `Счёт в системе: ${APP_URL()}/app/invoices`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    text,
    html: `<p>${escapeHtml(input.clientName)}, вам выставлен счёт <b>${escapeHtml(
      input.number,
    )}</b> на сумму <b>${escapeHtml(sum)}</b>.</p>
${due ? `<p>Оплатить до ${escapeHtml(due)}.</p>` : ""}
<p><a href="${APP_URL()}/app/invoices">Счёт в системе</a></p>`,
  };
}

/**
 * Письмо со счетом. Возвращает статус, а не бросает исключение: отправка
 * почты не должна отменять перевод счёта в «выставлен».
 */
export async function sendInvoiceEmail(input: {
  to: string | null;
  clientName: string;
  number: string;
  total: number;
  currency: string;
  dueDate: Date | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!input.to) return { sent: false, reason: "У клиента нет email" };
  try {
    const { subject, text, html } = invoiceBody(input);
    await sendMail({ to: input.to, subject, text, html });
    return { sent: true };
  } catch {
    return { sent: false, reason: "Почтовый сервис недоступен" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
