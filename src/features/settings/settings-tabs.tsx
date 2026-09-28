"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/settings", label: "Профиль и воркспейс" },
  { href: "/app/settings/team", label: "Команда" },
];

/** Вложенная навигация настроек. Роль tablist не ставим: это обычные ссылки. */
export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Разделы настроек" className="mb-4 flex gap-1 border-b border-line">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ink-subtle hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
