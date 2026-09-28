import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FolderKanban } from "lucide-react";
import { activeWorkspaceId, activeWorkspaceOrThrow, hasRole } from "@/auth/workspace";
import { requireUser } from "@/auth/session";
import { findClientOptions, findProjects } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { AddProjectButton } from "@/features/projects/add-project-button";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS } from "@/lib/status";
import { formatMoney, formatDate, isOverdue } from "@/lib/format";

export const metadata: Metadata = { title: "Проекты" };

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "ACTIVE", label: "В работе" },
  { value: "ON_HOLD", label: "Приостановлены" },
  { value: "DONE", label: "Завершены" },
  { value: "ARCHIVED", label: "Архив" },
];


export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireUser();
  const workspaceId = await activeWorkspaceId();
  const params = await searchParams;
  const clients = await findClientOptions(workspaceId);
  const { workspace } = await activeWorkspaceOrThrow({ user });
  const canCreate = hasRole(workspace.role, "MANAGER");

  return (
    <>
      <PageHeader
        title="Проекты"
        description="Всё, что команда делает для клиентов: сроки, бюджеты, задачи"
        actions={canCreate ? <AddProjectButton clients={clients} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <FilterTabs param="status" tabs={STATUS_FILTERS} />
        </Suspense>
        <Suspense>
          <SearchInput label="Поиск проекта" placeholder="Название или клиент" />
        </Suspense>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <ProjectsTable q={params.q} status={params.status} />
      </Suspense>
    </>
  );
}

async function ProjectsTable({ q, status }: { q?: string; status?: string }) {
  const workspaceId = await activeWorkspaceId();
  const projects = await findProjects(workspaceId, { q, status });

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban className="size-7" aria-hidden />}
        title={q || status ? "Ничего не найдено" : "Проектов пока нет"}
        description={
          q || status
            ? "Снимите фильтр или измените запрос."
            : "Создайте проект — задачи, доска и счета появятся внутри него."
        }
      />
    );
  }

  return (
    <>
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Список проектов</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium">Проект</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Этап</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Задачи</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Бюджет</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Срок</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {projects.map((p) => {
              const status = PROJECT_STATUS[p.status] ?? {
                label: p.status,
                tone: "neutral" as const,
              };
              const done = p.tasks.filter((t) => t.status === "DONE").length;
              return (
                <tr key={p.id} className="hover:bg-surface-muted">
                  <td className="px-4 py-3">
                    <Link href={`/app/projects/${p.id}`} className="font-medium hover:text-accent">
                      {p.name}
                    </Link>
                    <span className="block truncate text-xs text-ink-subtle">{p.client.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <td className="tnum px-4 py-3 text-right">
                    {done}/{p.tasks.length}
                  </td>
                  <td className="tnum px-4 py-3 text-right">
                    {formatMoney(p.budget, p.currency)}
                  </td>
                  <td
                    className={
                      "tnum px-4 py-3 text-right " +
                      (isOverdue(p.dueDate, p.status) ? "text-danger" : "text-ink-muted")
                    }
                  >
                    {p.dueDate ? formatDate(p.dueDate) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {projects.map((p) => {
          const status = PROJECT_STATUS[p.status] ?? { label: p.status, tone: "neutral" as const };
          const done = p.tasks.filter((t) => t.status === "DONE").length;
          return (
            <li key={p.id} className="card p-3">
              <Link href={`/app/projects/${p.id}`}>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-muted">{p.client.name}</span>
                <span className="tnum mt-2 flex items-center justify-between text-xs text-ink-subtle">
                  <span>
                    {done}/{p.tasks.length} задач
                  </span>
                  <span>{formatMoney(p.budget, p.currency)}</span>
                  <span>{p.dueDate ? formatDate(p.dueDate) : "срок не задан"}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
