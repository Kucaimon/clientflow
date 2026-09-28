/**
 * Отчёты по деньгам.
 *
 * Всё считается в копейках и на уровне базы: вытащить все оплаты по воркспейсу
 * и сложить в JS — значит тянуть таблицы целиком на каждый заход на страницу.
 * Денежные итоги поэтому идут groupBy/aggregate, а не map/reduce.
 */
import { prisma } from "@/lib/prisma";

export type Period = { from: Date; to: Date };

/** Последние N календарных месяцев включительно с текущим. */
export function monthsPeriod(months: number, now = new Date()): Period {
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

/** Ключ «2026-09» для группировки по месяцу. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAME = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
export const monthLabel = (key: string): string => {
  const [year, month] = key.split("-").map(Number);
  return MONTH_NAME.format(new Date(year, month - 1, 1));
};

/**
 * Кассовая книга: все поступления за период.
 *
 * Оплата привязана к счёту, а счёт — к клиенту, поэтому воркспейс
 * фильтруется через relation. Сумму показаываем как её заплатили,
 * пересчёта курсов в продукте нет.
 */
export function findPayments(workspaceId: string, period: Period) {
  return prisma.invoicePayment.findMany({
    where: {
      date: { gte: period.from, lte: period.to },
      invoice: { workspaceId },
    },
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          currency: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { date: "desc" },
  });
}

export type PaymentTotals = {
  received: number;
  byMethod: { method: string; amount: number }[];
};

/** Итоги кассы: общая сумма и разбивка по способу оплаты. */
export async function paymentTotals(workspaceId: string, period: Period): Promise<PaymentTotals> {
  const [total, methods] = await Promise.all([
    prisma.invoicePayment.aggregate({
      where: { date: { gte: period.from, lte: period.to }, invoice: { workspaceId } },
      _sum: { amount: true },
    }),
    prisma.invoicePayment.groupBy({
      by: ["method"],
      where: { date: { gte: period.from, lte: period.to }, invoice: { workspaceId } },
      _sum: { amount: true },
    }),
  ]);

  return {
    received: total._sum.amount ?? 0,
    byMethod: methods
      .map((row) => ({ method: row.method ?? "OTHER", amount: row._sum.amount ?? 0 }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export type RevenueRow = { clientId: string; name: string; invoiced: number; received: number };

/**
 * Выручка по клиентам: что выставили и что реально пришло.
 *
 * Разрыв между этими колонками и есть работа с дебиторкой, поэтому они
 * всегда идут парой.
 */
export async function revenueByClient(workspaceId: string, period: Period): Promise<RevenueRow[]> {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["clientId"],
      where: {
        workspaceId,
        status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] },
        issueDate: { gte: period.from, lte: period.to },
      },
      _sum: { total: true },
    }),
    prisma.invoicePayment.groupBy({
      by: ["invoiceId"],
      where: { date: { gte: period.from, lte: period.to }, invoice: { workspaceId } },
      _sum: { amount: true },
    }),
  ]);

  const clients = await prisma.client.findMany({
    where: { id: { in: invoices.map((row) => row.clientId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(clients.map((client) => [client.id, client.name]));

  // Оплата сгруппирована по счету: чтобы получить клиента, счёт нужно
  // развязать — один запрос вместо N.
  const invoiceIds = payments.map((row) => row.invoiceId);
  const invoiceClient = invoiceIds.length
    ? await prisma.invoice.findMany({
        where: { id: { in: invoiceIds } },
        select: { id: true, clientId: true },
      })
    : [];
  const clientOfInvoice = new Map(invoiceClient.map((row) => [row.id, row.clientId]));

  const received = new Map<string, number>();
  for (const row of payments) {
    const clientId = clientOfInvoice.get(row.invoiceId);
    if (!clientId) continue;
    received.set(clientId, (received.get(clientId) ?? 0) + (row._sum.amount ?? 0));
  }

  const ids = new Set([...invoices.map((row) => row.clientId), ...received.keys()]);

  return [...ids]
    .map((clientId) => ({
      clientId,
      name: nameById.get(clientId) ?? "—",
      invoiced: invoices.find((row) => row.clientId === clientId)?._sum.total ?? 0,
      received: received.get(clientId) ?? 0,
    }))
    .sort((a, b) => b.received - a.received);
}

export type MonthRow = { key: string; received: number; invoiced: number };

/**
 * Помесячная динамика.
 *
 * Месяцы берём из запрошенного периода, а не из данных: пустой месяц на
 * графике — тоже информация, и без неё провал в кассе выглядит как
 * «данных нет».
 */
export async function revenueByMonth(workspaceId: string, period: Period): Promise<MonthRow[]> {
  const [payments, invoices] = await Promise.all([
    prisma.invoicePayment.findMany({
      where: { date: { gte: period.from, lte: period.to }, invoice: { workspaceId } },
      select: { amount: true, date: true },
    }),
    prisma.invoice.findMany({
      where: {
        workspaceId,
        status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] },
        issueDate: { gte: period.from, lte: period.to },
      },
      select: { total: true, issueDate: true },
    }),
  ]);

  const rows = new Map<string, MonthRow>();
  for (
    let cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);
    cursor <= period.to;
    cursor.setMonth(cursor.getMonth() + 1)
  ) {
    const key = monthKey(cursor);
    rows.set(key, { key, received: 0, invoiced: 0 });
  }

  for (const row of payments) {
    const bucket = rows.get(monthKey(row.date));
    if (bucket) bucket.received += row.amount;
  }
  for (const row of invoices) {
    const bucket = rows.get(monthKey(row.issueDate));
    if (bucket) bucket.invoiced += row.total;
  }

  return [...rows.values()];
}

export type AgingBucket = { label: string; amount: number; invoices: number };

/**
 * Старение долга: неоплаченные счета разложенные по возрасту просрочки.
 *
 * Считаем от dueDate, а не от даты выставления: клиент должен по сроку
 * из договора, и «просрочен на 30 дней» — та формулировка в которой
 * с долгом разговаривают.
 */
export async function receivablesAging(workspaceId: string, now = new Date()): Promise<AgingBucket[]> {
  const invoices = await prisma.invoice.findMany({
    where: { workspaceId, status: { in: ["SENT", "PARTIALLY_PAID"] } },
    select: { id: true, total: true, dueDate: true, payments: { select: { amount: true } } },
  });

  const buckets: AgingBucket[] = [
    { label: "Не просрочен", amount: 0, invoices: 0 },
    { label: "1–15 дней", amount: 0, invoices: 0 },
    { label: "16–30 дней", amount: 0, invoices: 0 },
    { label: "Больше 30 дней", amount: 0, invoices: 0 },
  ];

  for (const invoice of invoices) {
    const paid = invoice.payments.reduce((sum, row) => sum + row.amount, 0);
    const due = invoice.total - paid;
    if (due <= 0) continue;

    // Срока может не быть — тогда счёт ещё не о чем просрочивать.
    const overdueDays = invoice.dueDate
      ? Math.max(0, Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000))
      : 0;
    const index = overdueDays === 0 ? 0 : overdueDays <= 15 ? 1 : overdueDays <= 30 ? 2 : 3;
    buckets[index].amount += due;
    buckets[index].invoices += 1;
  }

  return buckets;
}
