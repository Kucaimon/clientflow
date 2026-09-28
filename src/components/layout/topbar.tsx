"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";
import { useState } from "react";
import { SearchDialog } from "./search-dialog";
import { Brand } from "./brand";
import { NAV, isActive } from "./nav";
import { relativeTime } from "@/lib/format";
import type { NotificationRow } from "@/app/app/layout";

export function Topbar({
  notifications,
  title,
}: {
  notifications: NotificationRow[];
  title: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = notifications.filter((n) => !n.readAt).length;
  // Путь берём из роутера, а не из window: ветка «окно есть/нет» даёт
  // разные значения на сервере и клиенте — классическая ошибка гидрации.
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line-canvas bg-canvas px-4">
      <button
        type="button"
        className="btn btn-ghost h-9 w-9 p-0 md:hidden"
        aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>

      <div className="md:hidden">
        <Brand compact />
      </div>

      <h1 className="hidden text-sm font-semibold text-on-canvas md:block">{title}</h1>

      <div className="flex-1" />

      <SearchDialog />

      <details className="group relative">
        <summary className="btn btn-ghost relative h-9 w-9 list-none p-0" aria-label={`Уведомления: ${unread}`}>
          <Bell className="size-5" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </summary>

        <div className="absolute right-0 top-11 z-30 w-80 card p-1">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Уведомления
          </p>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">Пока пусто</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.slice(0, 12).map((n) => (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      className="block rounded-md px-3 py-2 hover:bg-surface-muted"
                    >
                      <span className={"block text-sm " + (n.readAt ? "text-ink-muted" : "font-medium")}>
                        {n.message}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-subtle">
                        {relativeTime(n.createdAt)}
                      </span>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      {menuOpen ? (
        <div className="absolute inset-x-0 top-14 z-20 border-b border-line-canvas bg-canvas p-2 md:hidden">
          <nav className="grid gap-1" aria-label="Мобильная навигация">
            {[...NAV, { href: "/app/settings", label: "Настройки" }].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={
                  "rounded-md px-3 py-2 text-sm font-medium " +
                  (isActive(pathname, item.href)
                    ? "bg-white/10 text-on-canvas"
                    : "text-on-canvas-muted hover:bg-white/5 hover:text-on-canvas")
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
