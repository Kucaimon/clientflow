import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { paymentCreateSchema } from "@/lib/validation";
import { logActivity } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";

/**
 * Платежи по счету.
 *
 * Статус счёта выводится из суммы платежей, а не задаётся руками: «оплачен»
 * на полсчёта — это расхождение, которое видно только когда клиент звонит
 * и говорит, что всё заплатил.
 */
async function statusFor(total: number, paid: number) {
  if (paid >= total && total > 0) return "PAID" as const;
  if (paid > 0) return "PARTIALLY_PAID" as const;
  return "SENT" as const;
}

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: access.workspace.id },
    select: { id: true },
  });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");

  return ok(
    await prisma.invoicePayment.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { date: "asc" },
    }),
  );
});

export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const { id } = await params;
  const body = await readJson(req, paymentCreateSchema);

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: access.workspace.id },
    include: { payments: { select: { amount: true } } },
  });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");
  if (invoice.status === "DRAFT") {
    throw new AppError(ErrorCodes.CONFLICT, "По черновику оплата не принимается");
  }
  if (invoice.status === "VOID") {
    throw new AppError(ErrorCodes.CONFLICT, "Счёт отозван");
  }

  const alreadyPaid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  if (alreadyPaid + body.amount > invoice.total) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "Сумма больше остатка по счету",
    );
  }

  const paid = alreadyPaid + body.amount;
  const status = await statusFor(invoice.total, paid);

  const payment = await prisma.invoicePayment.create({
    data: {
      invoiceId: invoice.id,
      amount: body.amount,
      date: body.date ? new Date(body.date) : new Date(),
      method: body.method,
      note: body.note ?? null,
    },
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status,
      paidAt: status === "PAID" ? new Date() : null,
    },
  });

  await logActivity(prisma, {
      workspaceId: access.workspace.id,
      userId: user.id,
      entityId: invoice.id,
      type: status === "PAID" ? "invoice.paid" : "invoice.status_changed",
    meta: { title: invoice.number, amount: body.amount, status },
  });

  if (status === "PAID") {
    const admins = await prisma.workspaceMember.findMany({
      where: { workspaceId: access.workspace.id, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });
    await notifyMany(prisma, {
      workspaceId: access.workspace.id,
      userIds: admins.map((member) => member.userId).filter((memberId) => memberId !== user.id),
      type: "INVOICE_PAID",
      title: `Счёт ${invoice.number} оплачен`,
      href: `/app/invoices/${invoice.id}`,
      actorId: user.id,
      entityId: invoice.id,
    });
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoice.id}`);
  return created(payment);
});
