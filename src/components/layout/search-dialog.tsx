"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

type Results = {
  clients: { id: string; name: string; industry: string | null }[];
  projects: { id: string; name: string; status: string; client: { name: string } }[];
  tasks: { id: string; title: string; status: string; project: { id: string; name: string } }[];
};

const EMPTY: Results = { clients: [], projects: [], tasks: [] };

/**
 * Глобальный поиск.
 * Запрос отправляем с задержкой 300 мс: без debounce на каждое нажатие клавиши
 * летит запрос в БД, и строка поиска становится самой нагруженной таблицей.
 */
export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl+K — у устоявшихся SaaS-интерфейсов это уже ожидание пользователя.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Короткий запрос — это «ещё не искали»: пустые результаты и спиннер
  // выводятся производными значениями, а не сбросом состояния в эффекте.
  const term = query.trim();
  const searching = term.length >= 2;
  const visible = searching ? results : EMPTY;
  const busy = searching && loading;

  useEffect(() => {
    if (!searching) return;

    const timer = setTimeout(async () => {
      // Новый запрос отменяет предыдущий: иначе «опоздавший» ответ по «аб»
      // перерисует результаты уже набранного «абв».
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setLoading(true);

      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
        if (res.ok) setResults((await res.json()) as Results);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setResults(EMPTY);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searching, term]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const empty =
    searching && !busy && !visible.clients.length && !visible.projects.length && !visible.tasks.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-ghost hidden h-9 w-64 justify-start gap-2 border border-line-strong text-ink-subtle sm:inline-flex">
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left text-sm">Поиск…</span>
        <kbd className="rounded border border-line px-1.5 text-[11px] font-medium">⌘K</kbd>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-[15%] z-50 w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 card p-0">
          <Dialog.Title className="sr-only">Поиск по рабочему пространству</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 text-ink-subtle" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Клиент, проект или задача"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
              aria-label="Поисковый запрос"
            />
            {loading ? <Loader2 className="size-4 animate-spin text-ink-subtle" aria-hidden /> : null}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {empty ? (
              <p className="px-3 py-6 text-center text-sm text-ink-muted">
                Ничего не найдено по «{query.trim()}»
              </p>
            ) : null}

            {results.clients.length > 0 ? (
              <Group title="Клиенты">
                {results.clients.map((c) => (
                  <Row key={c.id} onClick={() => go(`/app/clients/${c.id}`)} title={c.name} meta={c.industry ?? ""} />
                ))}
              </Group>
            ) : null}

            {results.projects.length > 0 ? (
              <Group title="Проекты">
                {results.projects.map((p) => (
                  <Row
                    key={p.id}
                    onClick={() => go(`/app/projects/${p.id}`)}
                    title={p.name}
                    meta={p.client.name}
                  />
                ))}
              </Group>
            ) : null}

            {results.tasks.length > 0 ? (
              <Group title="Задачи">
                {results.tasks.map((t) => (
                  <Row
                    key={t.id}
                    onClick={() => go(`/app/projects/${t.project.id}`)}
                    title={t.title}
                    meta={t.project.name}
                  />
                ))}
              </Group>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ title, meta, onClick }: { title: string; meta: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted"
    >
      <span className="truncate">{title}</span>
      <span className="shrink-0 text-xs text-ink-subtle">{meta}</span>
    </button>
  );
}
