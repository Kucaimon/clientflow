"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { Brand } from "./brand";
import { NAV, isActive } from "./nav";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/status";
import type { SessionUser } from "@/auth/session";
import type { Role } from "@/auth/workspace";

/**
 * Боковая панель на десктопе и нижняя навигация на мобильном (ТЗ 26).
 * Один источник пунктов на оба случая — иначе состав разделов разъедется.
 */
export function Sidebar({
  user,
  workspace,
}: {
  user: SessionUser;
  /** Активный воркспейс с ролью в нём: показываем, где человек и за что отвечает. */
  workspace: { name: string; role: Role } | null;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line-canvas bg-canvas md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/app/dashboard" className="rounded focus-visible:outline-2">
            <Brand />
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2" aria-label="Основная навигация">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-white/10 text-on-canvas"
                    : "text-on-canvas-muted hover:bg-white/5 hover:text-on-canvas")
                }
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line-canvas p-2">
          <Link
            href="/app/settings"
            className={
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors " +
              (isActive(pathname, "/app/settings")
                ? "bg-white/10 text-on-canvas"
                : "text-on-canvas-muted hover:bg-white/5 hover:text-on-canvas")
            }
          >
            <Settings className="size-4" aria-hidden />
            Настройки
          </Link>

          <div className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10 text-[11px] font-semibold text-on-canvas"
              aria-hidden
            >
              {initials(user.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-on-canvas">{user.name}</span>
              <span className="block truncate text-xs text-on-canvas-muted">
                {workspace ? `${workspace.name} · ${ROLE_LABEL[workspace.role] ?? workspace.role}` : "Нет воркспейса"}
              </span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-line-canvas bg-canvas md:hidden"
        aria-label="Основная навигация"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium " +
                (active ? "text-on-canvas" : "text-on-canvas-muted")
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/** Форма, а не кнопка с onClick: POST-выход должен работать и без JS. */
function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className="rounded p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink"
        aria-label="Выйти"
        title="Выйти"
      >
        <LogOut className="size-4" aria-hidden />
      </button>
    </form>
  );
}
