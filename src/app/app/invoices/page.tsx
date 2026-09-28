import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { activeWorkspaceId, activeWorkspaceOrThrow, hasRole } from "@/auth/workspace";
import { requireUser } from "@/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { INVOICE_STATUS } from "@/lib/status";
import { formatDate, formatMoney, isOverdue } from "@/lib/format";
import { CreateInvoiceButton } from "@/features/invoices/create-invoice-button";

export const metadata: Metadata = { title: "Счета" };

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "DRAFT", label: "Черновики" },
  { value: "SENT", label: "Отправлены" },
  { value: "PARTIALLY_PAID", label: "Частично" },
  { value: "PAID", label: "Оплачены" },
];

/** Статусы, по которым деньги ещё не пришли. */
const WAITING = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

type Search = { q?: string; status?: string };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId();
  const params = await searchParams;
  // Счёт — денежный документ: создаёт его менеджер, а не любой участник.
  const { workspace } = await activeWorkspaceOrThrow({ user });
  const canCreate = hasRole(workspace.role, "MANAGER");

  const where: Record<string, unknown> = { workspaceId };
  if (params.status) where.status = params.status;
  if (params.q) where.number = { contains: params.q };

  const [invoices, clients] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
      orderBy: { issueDate: "desc" },
      take: 200,
    }),
    prisma.client.findMany({
      where: { workspaceId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const expected = invoices
    .filter((invoice) => WAITING.includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const received = invoices
    .filter((invoice) => invoice.status !== "VOID")
    .reduce((sum, invoice) => sum + invoice.payments.reduce((s, p) => s + p.amount, 0), 0);
  const late = invoices.filter((invoice) => isOverdue(invoice.dueDate, invoice.status)).length;

  return (
    <>
      <PageHeader
        title="Счета"
        description={`Ожидается ${formatMoney(expected)} · получено ${formatMoney(received)}${
          late ? ` · просрочено ${late}` : ""
        }`}
        actions={canCreate ? <CreateInvoiceButton clients={clients} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <FilterTabs param="status" tabs={STATUS_FILTERS} />
        </Suspense>
        <Suspense>
          <SearchInput label="Поиск по номеру" placeholder="2026-0001" />
        </Suspense>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          title="Счетов пока нет"
          description="Счёт можно создать вручную или выставить из времени проекта."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Список счетов</caption>
            <thead className="bg-surface-muted text-left text-xs text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Номер</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Клиент</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Статус</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Сумма</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Оплачено</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((invoice) => {
                const status = INVOICE_STATUS[invoice.status] ?? {
                  label: invoice.status,
                  tone: "neutral" as const,
                };
                const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
                const partial = paid > 0 && paid < invoice.total;
                return (
                  <tr key={invoice.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <Link
                        href={`/app/invoices/${invoice.id}`}
                        className="tnum font-medium hover:text-accent"
                      >
                        {invoice.number}
                      </Link>
                      <span className="block text-xs text-ink-subtle">
                        {formatDate(invoice.issueDate)}
                      </span>
                    </td>
                    <td className="truncate px-4 py-3 text-ink-muted">{invoice.client.name}</td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="tnum px-4 py-3 text-right font-medium">
                      {formatMoney(invoice.total, invoice.currency)}
                    </td>
                    <td className={"tnum px-4 py-3 text-right " + (partial ? "text-warning" : "text-ink-muted")}>
                      {paid ? formatMoney(paid, invoice.currency) : "—"}
                    </td>
                    <td
                      className={
                        "tnum px-4 py-3 text-right " +
                        (isOverdue(invoice.dueDate, invoice.status) ? "text-danger" : "text-ink-muted")
                      }
                    >
                      {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
