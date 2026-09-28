import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { created, ok, parseBody, readQuery, route } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { invoiceCreateSchema, invoiceListQuerySchema } from "@/lib/validation";
import { createInvoice } from "@/lib/invoice-service";

/**
 * Счета.
 *
 * Список отдается с суммой оплат: «сколько уже пришло» — первый вопрос к
 * любому счёту, и считать это на каждой карточке отдельно дороже.
 */
export const GET = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const query = readQuery(invoiceListQuerySchema, req);

  const where: Record<string, unknown> = { workspaceId: access.workspace.id };
  if (query.status) where.status = query.status;
  if (query.clientId) where.clientId = query.clientId;
  if (query.projectId) where.projectId = query.projectId;
  if (query.q) where.number = { contains: query.q };
  if (query.from || query.to) {
    where.issueDate = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
        _count: { select: { items: true } },
      },
      orderBy: { issueDate: "desc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.invoice.count({ where }),
  ]);

  return ok({
    items: items.map((invoice) => ({
      ...invoice,
      items: undefined,
      paid: invoice.payments.reduce((sum, payment) => sum + payment.amount, 0),
    })),
    total,
    page: query.page,
    perPage: query.perPage,
  });
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MANAGER", user });
  const body = await parseBody(invoiceCreateSchema, req);

  const invoice = await createInvoice(access.workspace.id, user.id, body);

  revalidatePath("/app/invoices");
  return created({ invoice });
});
