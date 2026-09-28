import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ok, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { logActivity } from "@/lib/audit";

/**
 * Отзыв счёта.
 *
 * Отзванный счёт сохраняет номер и позиции — документ был, и это факт.
 * Время, попавшее в счёт, освобождается: работу можно выставить заново.
 */
export const POST = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "ADMIN", user });
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId: access.workspace.id },
  });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");
  if (invoice.status === "VOID") throw new AppError(ErrorCodes.CONFLICT, "Счёт уже отозван");
  if (invoice.status === "PAID") {
    throw new AppError(ErrorCodes.CONFLICT, "Оплаченный счёт отзывать нельзя");
  }

  const voided = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "VOID" },
  });

  await prisma.timeEntry.updateMany({
    where: { invoiceId: invoice.id },
    data: { invoiceId: null },
  });

  await logActivity(prisma, {
      workspaceId: access.workspace.id,
      userId: user.id,
      entityId: invoice.id,
      type: "invoice.voided",
    meta: { title: invoice.number },
  });

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoice.id}`);
  return ok(voided);
});
