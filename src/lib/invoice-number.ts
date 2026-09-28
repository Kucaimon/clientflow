import type { Prisma } from "@prisma/client";

/**
 * Инкрементный номер счёта внутри воркспейса: INV-2026-0007.
 *
 * Считается внутри транзакции от количества счетов: два параллельных POST
 * не должны выдать один номер — уникальный индекс на number это поймает,
 * но лучше честно посчитать внутри tx.
 */
export async function nextInvoiceNumber(
  tx: Pick<Prisma.TransactionClient, "invoice">,
  workspaceId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const count = await tx.invoice.count({ where: { workspaceId } });
  return `INV-${year}-${String(count + 1).padStart(4, "0")}`;
}
