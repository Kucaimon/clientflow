import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { requireUser } from "@/auth/session";
import { activeWorkspaceId, activeWorkspaceOrThrow, hasRole } from "@/auth/workspace";
import { findClients } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { AddClientButton } from "@/features/clients/add-client-button";
import { EmptyState, TableSkeleton } from "@/components/ui/states";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Клиенты" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;

  // Кнопку не показываем тем, кто упрётся в 403: доступ к созданию клиентов
  // начинается с менеджера, и это должно быть видно до попытки.
  const workspace = await activeWorkspaceOrThrow({ user });
  const canCreate = hasRole(workspace.workspace.role, "MANAGER");

  return (
    <>
      <PageHeader
        title="Клиенты"
        description="База компаний: проекты, счета и контакты привязываются к клиенту"
        actions={canCreate ? <AddClientButton /> : undefined}
      />

      <div className="mb-4">
        <Suspense>
          <SearchInput label="Поиск клиента" placeholder="Название, сфера или сайт" />
        </Suspense>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <ClientTable q={q} canCreate={canCreate} />
      </Suspense>
    </>
  );
}

async function ClientTable({ q, canCreate }: { q?: string; canCreate: boolean }) {
  const workspaceId = await activeWorkspaceId();
  const clients = await findClients(workspaceId, q);

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={<Users className="size-7" aria-hidden />}
        title={q ? `По запросу «${q}» никого нет` : "Клиентов пока нет"}
        description={
          q
            ? "Попробуйте другое название или снимите фильтр."
            : "Добавьте первую компанию — затем создайте проект и задачи."
        }
        action={!q && canCreate ? <AddClientButton /> : undefined}
      />
    );
  }

  return (
    <>
      {/* Desktop: таблица */}
      <div className="card hidden overflow-hidden md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Список клиентов</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-subtle">
              <th scope="col" className="px-4 py-2.5 font-medium">Клиент</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Сфера</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Контакт</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Проекты</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Обновлён</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-surface-muted">
                <td className="px-4 py-3">
                  <Link href={`/app/clients/${c.id}`} className="font-medium hover:text-accent">
                    {c.name}
                  </Link>
                  {c.website ? (
                    <span className="block truncate text-xs text-ink-subtle">{c.website}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink-muted">{c.industry ?? "—"}</td>
                <td className="truncate px-4 py-3 text-ink-muted">{c.email ?? "—"}</td>
                <td className="tnum px-4 py-3 text-right">{c._count.projects}</td>
                <td className="tnum px-4 py-3 text-right text-ink-subtle">
                  {formatDate(c.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: карточки вместо горизонтального скролла таблицы */}
      <ul className="space-y-2 md:hidden">
        {clients.map((c) => (
          <li key={c.id} className="card p-3">
            <Link href={`/app/clients/${c.id}`} className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{c.name}</span>
                <span className="tnum shrink-0 text-xs text-ink-subtle">
                  {c._count.projects} проектов
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-ink-muted">
                {c.industry ?? "Сфера не указана"} · обновлён {formatDate(c.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
