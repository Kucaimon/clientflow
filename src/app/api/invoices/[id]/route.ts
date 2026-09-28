import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { noContent, ok, parseBody, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { invoiceUpdateSchema } from "@/lib/validation";
import { updateInvoice } from "@/lib/invoice-service";
import { logActivity } from "@/lib/audit";

async function load(id: string, workspaceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id, workspaceId } });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");
  return invoice;
}

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { id } = await params;
  await load(id, access.workspace.id);

  const invoice = await prisma.invoice.findFirst({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, company: true } },
      project: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { date: "asc" } },
      timeEntries: { select: { id: true, minutes: true } },
    },
  });

  const paid = invoice?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0;
  return ok({ ...invoice, paid });
});

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const { id } = await params;
  const body = await parseBody(invoiceUpdateSchema, req);

  const invoice = await updateInvoice(access.workspace.id, id, user.id, body);

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoice.id}`);
  return ok(invoice);
});

/**
 * Удаление счёта.
 *
 * Черновик удаляем, выставленный — только отзывать: счет уже мог уйти
 * клиенту, и его исчезновение из системы выглядит как потеря документа.
 */
export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { id } = await params;
  const invoice = await load(id, access.workspace.id);

  if (invoice.status !== "DRAFT") {
    throw new AppError(ErrorCodes.CONFLICT, "Выставленный счёт нельзя удалить — отзовите его");
  }

  // Время отвязывается каскадом SetNull, но напомним себе, что оно освобождается.
  await prisma.timeEntry.updateMany({
    where: { invoiceId: invoice.id },
    data: { invoiceId: null },
  });
  await prisma.invoice.delete({ where: { id: invoice.id } });

  await logActivity(prisma, {
    workspaceId: access.workspace.id,
    userId: user.id,
    entityId: invoice.id,
    type: "invoice.deleted",
    meta: { title: invoice.number },
  });

  revalidatePath("/app/invoices");
  return noContent();
});
