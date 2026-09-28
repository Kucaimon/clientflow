import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney, formatDate } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/status";
import {
  findPayments,
  monthLabel,
  monthsPeriod,
  paymentTotals,
  receivablesAging,
  revenueByClient,
  revenueByMonth,
} from "@/lib/reports";

export const metadata: Metadata = { title: "Отчёты" };

const PERIODS = [
  { months: 3, label: "3 месяца" },
  { months: 6, label: "6 месяцев" },
  { months: 12, label: "12 месяцев" },
];

/**
 * Отчёты по деньгам.
 *
 * Период выбирается через query, а не состоянием на клиенте: страницу
 * должно быть на что прислать ссылку из письма («вот касса за квартал»).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const { workspace } = await activeWorkspaceOrThrow({ user });

  const query = await searchParams;
  const requested = Number(query.period);
  const months = PERIODS.some((item) => item.months === requested) ? requested : 6;
  const period = monthsPeriod(months);

  const [payments, totals, byClient, byMonth, aging] = await Promise.all([
    findPayments(workspace.id, period),
    paymentTotals(workspace.id, period),
    revenueByClient(workspace.id, period),
    revenueByMonth(workspace.id, period),
    receivablesAging(workspace.id),
  ]);

  const outstanding = aging.reduce((sum, bucket) => sum + bucket.amount, 0);
  const maxMonth = Math.max(1, ...byMonth.map((row) => Math.max(row.received, row.invoiced)));

  return (
    <>
      <PageHeader
        title="Отчёты"
        description={`${monthLabel(byMonth[0]?.key ?? "")} — ${monthLabel(byMonth[byMonth.length - 1]?.key ?? "")}`}
        actions={
          <div className="flex gap-1 rounded-md border border-line p-0.5">
            {PERIODS.map((item) => (
              <Link
                key={item.months}
                href={`/app/reports?period=${item.months}`}
                aria-current={months === item.months ? "true" : undefined}
                className={
                  months === item.months
                    ? "rounded px-2.5 py-1 text-sm bg-surface-muted font-medium"
                    : "rounded px-2.5 py-1 text-sm text-ink-subtle hover:text-ink"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Получено" value={formatMoney(totals.received, workspace.currency)} tone="ok" />
        <Stat label="К получению" value={formatMoney(outstanding, workspace.currency)} />
        <Stat
          label="Оплат за период"
          value={String(payments.length)}
          hint={totals.byMethod.map((row) => PAYMENT_METHOD[row.method] ?? row.method).join(" · ") || undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Выручка по месяцам</h2>
          <div className="space-y-2.5 px-5 py-4">
            {byMonth.map((row) => (
              <div key={row.key} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3">
                <span className="truncate text-xs text-ink-subtle capitalize">{monthLabel(row.key)}</span>
                <div className="space-y-1">
                  <Bar value={row.invoiced} max={maxMonth} className="bg-line-strong" />
                  <Bar value={row.received} max={maxMonth} className="bg-accent" />
                </div>
                <span className="text-right text-xs tabular-nums">{formatMoney(row.received, workspace.currency)}</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-ink-subtle">
              Светлая полоса — выставлено, тёмная — получено.
            </p>
          </div>
        </section>

        <section className="card">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Старение долга</h2>
          {aging.every((bucket) => bucket.amount === 0) ? (
            <p className="px-5 py-6 text-sm text-ink-subtle">Просроченных счетов нет.</p>
          ) : (
            <ul className="divide-y divide-line">
              {aging.map((bucket) => (
                <li key={bucket.label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="text-sm">{bucket.label}</span>
                  <span className="text-sm tabular-nums">
                    {bucket.invoices > 0 ? (
                      <span className="mr-2 text-xs text-ink-subtle">{bucket.invoices} сч.</span>
                    ) : null}
                    {formatMoney(bucket.amount, workspace.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-4">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">По клиентам</h2>
        {byClient.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-subtle">За этот период счетов не выставляли.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-subtle">
                <th className="px-5 py-2 font-medium">Клиент</th>
                <th className="px-5 py-2 text-right font-medium">Выставлено</th>
                <th className="px-5 py-2 text-right font-medium">Получено</th>
                <th className="px-5 py-2 text-right font-medium">Долг</th>
              </tr>
            </thead>
            <tbody>
              {byClient.map((row) => (
                <tr key={row.clientId} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5">
                    <Link href={`/app/clients/${row.clientId}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatMoney(row.invoiced, workspace.currency)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{formatMoney(row.received, workspace.currency)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {row.invoiced - row.received > 0 ? (
                      <span className="text-warning">{formatMoney(row.invoiced - row.received, workspace.currency)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card mt-4">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Кассовая книга</h2>
        {payments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-subtle">Поступлений за этот период не было.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-subtle">
                <th className="px-5 py-2 font-medium">Дата</th>
                <th className="px-5 py-2 font-medium">Счёт</th>
                <th className="px-5 py-2 font-medium">Способ</th>
                <th className="px-5 py-2 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-muted">{formatDate(row.date)}</td>
                  <td className="px-5 py-2.5">
                    <Link href={`/app/invoices/${row.invoice.id}`} className="hover:underline">
                      {row.invoice.number}
                    </Link>
                    <span className="ml-2 text-xs text-ink-subtle">{row.invoice.client.name}</span>
                  </td>
                  <td className="px-5 py-2.5 text-ink-muted">{PAYMENT_METHOD[row.method ?? "OTHER"] ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {formatMoney(row.amount, row.invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className={tone === "ok" ? "mt-1 text-lg font-semibold tabular-nums text-success" : "mt-1 text-lg font-semibold tabular-nums"}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-xs text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-1.5 rounded-full bg-surface-muted">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
