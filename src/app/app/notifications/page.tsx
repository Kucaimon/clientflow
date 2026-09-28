import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { MarkAllReadButton } from "@/features/notifications/mark-all-read";
import { relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "Уведомления" };

/**
 * Все уведомления.
 *
 * Колокольец в шапке показывает последние и живёт на каждой странице, а сюда
 * приходят разбираться с долгом по задачам: поэтому список полный, до 200
 * штук, и непрочитанные помечены левосей точкой, а не только цветом текста.
 */
export default async function NotificationsPage() {
  const user = await requireUser();

  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const unread = items.filter((item) => !item.readAt).length;

  return (
    <>
      <PageHeader
        title="Уведомления"
        description={unread > 0 ? `${unread} непрочитанных` : "Всё прочитано"}
        actions={unread > 0 ? <MarkAllReadButton /> : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="size-7" aria-hidden />}
          title="Уведомлений нет"
          description="Здесь появятся назначения задач, упоминания в комментариях и напоминания о сроках."
        />
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((item) => {
            const body = (
              <>
                {!item.readAt ? (
                  <span
                    className="mt-2 size-2 shrink-0 rounded-full bg-accent"
                    aria-label="не прочитано"
                  />
                ) : (
                  <span className="mt-2 size-2 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 flex-1 py-3">
                  <span className={item.readAt ? "block text-sm text-ink-muted" : "block text-sm font-medium"}>
                    {item.title}
                  </span>
                  {item.body ? (
                    <span className="mt-0.5 block text-sm text-ink-muted">{item.body}</span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-ink-subtle">{relativeTime(item.createdAt)}</span>
                </span>
              </>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="flex items-start gap-3 px-5 hover:bg-surface-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
