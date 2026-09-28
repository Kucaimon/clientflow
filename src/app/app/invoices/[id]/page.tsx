import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/auth/session";
import { hasRole, requireActiveWorkspace } from "@/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { INVOICE_STATUS, PAYMENT_METHOD } from "@/lib/status";
import { formatDate, formatMoney, isOverdue } from "@/lib/format";
import { InvoiceActions } from "@/features/invoices/invoice-actions";
import { AddPaymentForm } from "@/features/invoices/add-payment-form";
import { PrintButton } from "@/features/invoices/print-button";

export const metadata: Metadata = { title: "Счёт" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const membership = await requireActiveWorkspace(user);
  const workspaceId = membership.id;

  const invoice = await prisma.invoice.findFirst({
    where: { id, workspaceId },
    include: {
      client: { select: { id: true, name: true, email: true, company: true } },
      project: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" } },
      payments: { orderBy: { date: "asc" } },
      timeEntries: { select: { id: true, minutes: true } },
    },
  });
  if (!invoice) notFound();

  const status = INVOICE_STATUS[invoice.status] ?? {
    label: invoice.status,
    tone: "neutral" as const,
  };
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(invoice.total - paid, 0);
  const minutes = invoice.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);

  const canAdmin = hasRole(membership.role, "ADMIN");

  return (
    <>
      <Link
        href="/app/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-canvas-muted hover:text-on-canvas"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Счета
      </Link>

      <header className="card mb-4 p-5 print-block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="tnum text-lg font-semibold tracking-tight">Счёт {invoice.number}</h1>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              <Link href={`/app/clients/${invoice.client.id}`} className="hover:text-accent">
                {invoice.client.name}
              </Link>
              {invoice.project ? ` · ${invoice.project.name}` : ""}
            </p>
            <p className="mt-1 text-xs text-ink-subtle">
              Выставлен {formatDate(invoice.issueDate)}
              {invoice.dueDate ? (
                <span className={isOverdue(invoice.dueDate, invoice.status) ? " text-danger" : ""}>
                  {" "}
                  · оплатить до {formatDate(invoice.dueDate)}
                </span>
              ) : null}
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            <InvoiceActions invoiceId={invoice.id} status={invoice.status} canAdmin={canAdmin} />
          </div>
        </div>

        <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-subtle">Сумма</dt>
            <dd className="tnum mt-0.5 text-xl font-semibold tracking-tight">
              {formatMoney(invoice.total, invoice.currency)}
            </dd>
            {invoice.taxRate ? (
              <dd className="mt-0.5 text-xs text-ink-subtle">включая налог {invoice.taxRate}%</dd>
            ) : null}
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Оплачено</dt>
            <dd className="tnum mt-0.5 text-xl font-semibold tracking-tight">
              {formatMoney(paid, invoice.currency)}
            </dd>
            <dd className="mt-0.5 text-xs text-ink-subtle">
              {invoice.payments.length} платеж(ей)
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-subtle">Остаток</dt>
            <dd
              className={
                "tnum mt-0.5 text-xl font-semibold tracking-tight " +
                (remaining > 0 ? "text-warning" : "text-success")
              }
            >
              {formatMoney(remaining, invoice.currency)}
            </dd>
            {minutes ? (
              <dd className="mt-0.5 text-xs text-ink-subtle">
                в счёте {Math.round(minutes / 60)} ч работ
              </dd>
            ) : null}
          </div>
        </dl>
      </header>

      <div className="print-stack grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-label="Позиции счёта" className="card overflow-hidden">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
            Позиции ({invoice.items.length})
          </h2>
          {invoice.items.length === 0 ? (
            <EmptyState title="Позиций нет" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Наименование</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Кол-во</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Ставка</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2.5">{item.description}</td>
                    <td className="tnum px-4 py-2.5 text-right">{item.quantity}</td>
                    <td className="tnum px-4 py-2.5 text-right">
                      {formatMoney(item.unitPrice, invoice.currency)}
                    </td>
                    <td className="tnum px-4 py-2.5 text-right font-medium">
                      {formatMoney(Math.round(item.quantity * item.unitPrice), invoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-surface-muted">
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-xs text-ink-subtle">
                    Без налога
                  </td>
                  <td className="tnum px-4 py-2.5 text-right">
                    {formatMoney(invoice.subtotal, invoice.currency)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-medium">
                    Итого
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-sm font-semibold">
                    {formatMoney(invoice.total, invoice.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          {invoice.notes ? (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">{invoice.notes}</p>
          ) : null}
        </section>

        <div className="no-print space-y-4">
          {invoice.status === "DRAFT" ? (
            <section aria-label="Оплата" className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">Принять оплату</h2>
              <p className="mb-3 text-xs text-ink-subtle">
                Сначала отправьте счёт — оплата принимается только по выставленному.
              </p>
            </section>
          ) : remaining > 0 && invoice.status !== "VOID" ? (
            <section aria-label="Оплата" className="card p-4">
              <h2 className="mb-3 text-sm font-semibold">Принять оплату</h2>
              <AddPaymentForm
                invoiceId={invoice.id}
                remaining={remaining}
                currency={invoice.currency}
              />
            </section>
          ) : null}

          <section aria-label="История оплат" className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Оплаты ({invoice.payments.length})
            </h2>
            {invoice.payments.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-muted">Оплат ещё не было</p>
            ) : (
              <ul className="divide-y divide-line">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                    <span className="tnum shrink-0 text-xs text-ink-subtle">
                      {formatDate(payment.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-muted">
                      {PAYMENT_METHOD[payment.method ?? ""] ?? "Оплата"}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </span>
                    <span className="tnum shrink-0 font-medium">
                      {formatMoney(payment.amount, invoice.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
