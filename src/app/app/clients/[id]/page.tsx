import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { activeWorkspaceId } from "@/auth/workspace";
import { findClient } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS, PROJECT_STATUS } from "@/lib/status";
import { formatMoney, isOverdue } from "@/lib/format";
import { EmptyState } from "@/components/ui/states";

export const metadata: Metadata = { title: "Клиент" };

/** Счета, которые ещё не превратились в деньги. */
const UNPAID = ["SENT", "PARTIALLY_PAID", "OVERDUE"];

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await activeWorkspaceId();
  const { id } = await params;
  const client = await findClient(workspaceId, id);
  if (!client) notFound();

  const paid = client.invoices
    .filter((invoice) => invoice.status === "PAID")
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const outstanding = client.invoices
    .filter((invoice) => UNPAID.includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const activeProjects = client.projects.filter((project) => project.status === "ACTIVE").length;

  const stats = [
    { label: "Получено", value: formatMoney(paid), hint: "оплаченные счета" },
    { label: "Ожидает оплаты", value: formatMoney(outstanding), hint: "отправленные и просроченные" },
    { label: "Активных проектов", value: String(activeProjects), hint: `всего проектов ${client.projects.length}` },
  ];

  return (
    <>
      <Link
        href="/app/clients"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-canvas-muted hover:text-on-canvas"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Клиенты
      </Link>

      <header className="card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{client.name}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {[client.company, client.industry, client.website].filter(Boolean).join(" · ") ||
                "Реквизиты не заполнены"}
            </p>
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="mt-1 inline-block text-sm text-accent hover:underline"
              >
                {client.email}
              </a>
            ) : null}
          </div>
          <Link href={`/app/projects?clientId=${client.id}`} className="btn btn-ghost">
            Проекты клиента
          </Link>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs text-ink-subtle">{stat.label}</dt>
              <dd className="tnum mt-0.5 text-xl font-semibold tracking-tight">{stat.value}</dd>
              <dd className="mt-0.5 text-xs text-ink-subtle">{stat.hint}</dd>
            </div>
          ))}
        </dl>

        {client.note ? (
          <p className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">{client.note}</p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="client-projects" className="card overflow-hidden">
          <h2 id="client-projects" className="border-b border-line px-4 py-3 text-sm font-semibold">
            Проекты ({client.projects.length})
          </h2>

          {client.projects.length === 0 ? (
            <EmptyState title="У этого клиента ещё нет проектов" />
          ) : (
            <ul className="divide-y divide-line">
              {client.projects.map((project) => {
                const status = PROJECT_STATUS[project.status] ?? {
                  label: project.status,
                  tone: "neutral" as const,
                };
                const done = project._count.tasks;
                return (
                  <li key={project.id}>
                    <Link
                      href={`/app/projects/${project.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {project.name}
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="tnum text-xs text-ink-subtle">
                        задач: {done}
                      </span>
                      <span className="tnum text-sm">
                        {formatMoney(project.spent)}
                        {project.budget ? ` / ${formatMoney(project.budget)}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section aria-labelledby="client-invoices" className="card overflow-hidden">
            <h2 id="client-invoices" className="border-b border-line px-4 py-3 text-sm font-semibold">
              Счета ({client.invoices.length})
            </h2>
            {client.invoices.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">Счетов ещё нет</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.invoices.map((invoice) => {
                  const status = INVOICE_STATUS[invoice.status] ?? {
                    label: invoice.status,
                    tone: "neutral" as const,
                  };
                  return (
                    <li key={invoice.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="tnum min-w-0 flex-1 truncate">{invoice.number}</span>
                      {isOverdue(invoice.dueDate, invoice.status) ? (
                        <span className="text-xs font-medium text-danger">просрочен</span>
                      ) : null}
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="tnum w-24 text-right font-medium">
                        {formatMoney(invoice.total, invoice.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="client-contacts" className="card overflow-hidden">
            <h2 id="client-contacts" className="border-b border-line px-4 py-3 text-sm font-semibold">
              Контакты ({client.contacts.length})
            </h2>
            {client.contacts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-muted">Контакты не заведены</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.contacts.map((contact) => (
                  <li key={contact.id} className="px-4 py-2.5 text-sm">
                    <span className="font-medium">{contact.name}</span>
                    <span className="block text-xs text-ink-subtle">
                      {[contact.position, contact.email].filter(Boolean).join(" · ") || "—"}
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
