import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CircleDollarSign, FolderKanban, ListTodo } from "lucide-react";
import { requireUser } from "@/auth/session";
import { activeWorkspaceId } from "@/auth/workspace";
import { findDashboard } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { formatMoney, relativeTime, isOverdue } from "@/lib/format";
import { PROJECT_STATUS, activityText } from "@/lib/status";

export const metadata: Metadata = { title: "Обзор" };

export default async function DashboardPage() {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId();
  const data = await findDashboard(workspaceId);

  const cards = [
    {
      label: "Выручка за 30 дней",
      value: formatMoney(data.revenue),
      icon: CircleDollarSign,
      hint: "по оплаченным счетам",
    },
    {
      label: "Ожидает оплаты",
      value: formatMoney(data.outstanding),
      icon: AlertCircle,
      hint: "счета отправлены",
    },
    {
      label: "Активные проекты",
      value: String(data.activeProjects),
      icon: FolderKanban,
      hint: "в работе и на аналитике",
    },
    {
      label: "Открытые задачи",
      value: String(data.openTasks),
      icon: ListTodo,
      hint: data.overdueTasks > 0 ? `${data.overdueTasks} просрочено` : "просроченных нет",
      warn: data.overdueTasks > 0,
    },
  ];

  return (
    <>
      <PageHeader
        title={`Привет, ${user.name.split(" ")[0]}`}
        description="Состояние рабочего пространства на сегодня"
      />

      <section
        aria-label="Ключевые показатели"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-muted">{c.label}</p>
              <c.icon className="size-4 text-ink-subtle" aria-hidden />
            </div>
            <p className="tnum mt-2 text-2xl font-semibold tracking-tight">{c.value}</p>
            <p className={"mt-1 text-xs " + (c.warn ? "text-danger" : "text-ink-subtle")}>
              {c.hint}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="recent-projects" className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 id="recent-projects" className="text-sm font-semibold">
              Последние проекты
            </h2>
            <Link href="/app/projects" className="text-sm text-accent hover:underline">
              Все проекты
            </Link>
          </div>

          {data.projects.length === 0 ? (
            <EmptyState
              title="Проектов пока нет"
              description="Создайте проект — он появится здесь и на доске."
              action={
                <Link href="/app/projects" className="btn btn-primary">
                  Создать проект
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.projects.map((p) => {
                const done = p.tasks.filter((t) => t.status === "DONE").length;
                const progress = p.tasks.length
                  ? Math.round((done / p.tasks.length) * 100)
                  : 0;
                const status = PROJECT_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };

                return (
                  <li key={p.id}>
                    <Link
                      href={`/app/projects/${p.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-surface-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-xs text-ink-subtle">
                          {p.client.name}
                        </span>
                      </span>

                      <span className="hidden w-28 sm:block">
                        <span className="mb-1 block text-right text-[11px] text-ink-subtle tnum">
                          {progress}%
                        </span>
                        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      </span>

                      <span className="tnum hidden w-24 text-right text-sm sm:block">
                        {formatMoney(p.budget, p.currency)}
                      </span>

                      <Badge tone={status.tone}>{status.label}</Badge>

                      {isOverdue(p.dueDate, p.status) ? (
                        <span className="text-xs font-medium text-danger">срок прошёл</span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="activity" className="card p-4">
          <h2 id="activity" className="mb-3 text-sm font-semibold">
            Последние действия
          </h2>
          {data.recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">Здесь появятся изменения</p>
          ) : (
            <ul className="space-y-3">
              {data.recentActivity.map((a) => {
                let meta: Record<string, unknown> = {};
                try {
                  meta = a.meta ? (JSON.parse(a.meta) as Record<string, unknown>) : {};
                } catch {
                  // Лог не должен ронять страницу из-за битой записи.
                }

                return (
                  <li key={a.id} className="flex gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong"
                    />
                    <span className="min-w-0">
                      <span className="text-ink-muted">
                        <span className="font-medium text-ink">{a.user?.name ?? "Система"}</span>{" "}
                        {activityText(a.type, meta)}
                      </span>
                      <span className="block text-xs text-ink-subtle">
                        {relativeTime(a.createdAt)}
                        {a.project ? ` · ${a.project.name}` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
