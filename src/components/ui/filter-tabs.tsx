"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type FilterTab = { value: string; label: string; count?: number };

/**
 * Фильтр-табы поверх URL: значение живёт в query, поэтому ссылка на
 * «/projects?status=ACTIVE» работает как обычная закладка.
 */
export function FilterTabs({
  tabs,
  param = "status",
  className,
}: {
  tabs: FilterTab[];
  param?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param);

  function href(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    params.delete("page");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    <div
      role="tablist"
      className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1", className)}
    >
      {tabs.map((tab) => {
        const active = (tab.value || null) === current;
        return (
          <Link
            key={tab.value || "all"}
            href={href(tab.value || null)}
            role="tab"
            aria-selected={active}
            scroll={false}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
            onClick={(event) => {
              event.preventDefault();
              router.replace(href(tab.value || null), { scroll: false });
            }}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className={cn("text-xs", active ? "text-white/70" : "text-neutral-400")}>
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
