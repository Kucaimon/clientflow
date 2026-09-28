import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { recentActivity } from "@/lib/audit";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { activityText } from "@/lib/status";
import { formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "История" };

/** Куда вести из ленты: куда ведёт тип события — то и открываем. */
function hrefOf(type: string, entityId: string | null): string | null {
  if (!entityId) return null;
  const map: Record<string, string> = {
    task: "/app/tasks",
    comment: "/app/tasks",
    project: "/app/projects",
    client: "/app/clients",
    invoice: "/app/invoices",
  };
  const section = map[type.split(".")[0]];
  return section ? `${section}/${entityId}` : null;
}

const dayTitle = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** Мета хранится строкой JSON; битая строка не должна ронять страницу. */
function safeMeta(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Лента событий воркспейса.
 *
 * Группировка по дням нужна не для красоты: список читают как «что было
 * сегодня», а без разделов сутки сливаются с сутками.
 */
export default async function ActivityPage() {
  const user = await requireUser();
  const { workspace } = await activeWorkspaceOrThrow({ user });
  const rows = await recentActivity(workspace.id, 100);

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = dayTitle.format(row.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  return (
    <>
      <PageHeader title="История" description="Что менялось в воркспейсе и кто это сделал" />

      {rows.length === 0 ? (
        <EmptyState
          icon={<History className="size-7" aria-hidden />}
          title="Событий пока нет"
          description="Здесь появятся изменения проектов, задач, времени и счетов."
        />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{day}</h2>
              <ul className="card divide-y divide-line">
                {items.map((row) => {
                  const meta = safeMeta(row.meta);
                  const href = hrefOf(row.type, row.entityId);
                  return (
                    <li key={row.id} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
                      <span className="w-11 shrink-0 tabular-nums text-xs text-ink-subtle">
                        {formatTime(row.createdAt)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{row.user?.name ?? "Система"}</span>{" "}
                        <span className="text-ink-muted">{activityText(row.type, meta)}</span>
                        {meta.from && meta.to ? (
                          <span className="ml-1 text-xs text-ink-subtle">
                            {String(meta.from)} → {String(meta.to)}
                          </span>
                        ) : null}
                      </span>
                      {href ? (
                        <Link href={href} className="shrink-0 text-xs text-accent hover:underline">
                          открыть
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
