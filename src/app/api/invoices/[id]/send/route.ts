import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { logActivity } from "@/lib/audit";
import { sendInvoiceEmail } from "@/lib/mailer";

/**
 * Отправка счёта клиенту.
 *
 * Статус меняется в любой case, а письмо — лучшее усилие: если SMTP не
 * настроен, счёт всё равно должен считаться выставленным, иначе демо упирается
 * в почтовый сервер.
 */
export const POST = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: access.workspace.id },
    include: { client: { select: { id: true, name: true, email: true } } },
  });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");
  if (invoice.status !== "DRAFT") {
    throw new AppError(ErrorCodes.CONFLICT, "Счёт уже отправлен");
  }

  const sent = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: invoice.id,
    type: "invoice.sent",
    meta: { title: invoice.number },
  });

  const mail = await sendInvoiceEmail({
    to: invoice.client.email,
    clientName: invoice.client.name,
    number: invoice.number,
    total: invoice.total,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
  });

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoice.id}`);
  return ok({ invoice: sent, mail });
});
