"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Поиск по таблице с задержкой.
 * Значение живёт в URL (?q=): перезагрузка страницы и ссылка «поделиться»
 * сохраняют фильтр, а состояние не дублируется в двух местах.
 */
export function SearchInput({
  param = "q",
  placeholder = "Поиск…",
  label,
}: {
  param?: string;
  placeholder?: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams.get(param) ?? "";

  // URL мог измениться вне инпута (назад/вперёд, сброс фильтра) — подхватываем.
  // Синхронизация при рендере, а не в эффекте: эффект гонит лишний кадр
  // со старым значением и каскад перерисовок.
  const [state, setState] = useState({ value: initial, urlValue: initial });
  if (state.urlValue !== initial) {
    setState({ value: initial, urlValue: initial });
  }
  const value = state.value;
  const setValue = (next: string) => setState({ value: next, urlValue: initial });

  useEffect(() => {
    const current = searchParams.get(param) ?? "";
    if (value === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(param, value);
      else next.delete(param);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, param, pathname, router, searchParams]);

  return (
    <div className="relative w-full sm:w-64">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="input pl-8"
      />
    </div>
  );
}
