"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";

export type ChecklistItem = { id: string; title: string; done: boolean; position: number };

/**
 * Чек-лист задачи.
 *
 * Отметка пункта — оптимистичная: человек тыкает чекбокс подряд, и ждать
 * ответа сервера на каждый клик означало бы возню. Ошибка откатывает пункт.
 */
export function Checklist({ taskId, items }: { taskId: string; items: ChecklistItem[] }) {
  const [draft, setDraft] = useState("");
  const [local, setLocal] = useState(items);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { request, pending } = useApi();
  const router = useRouter();

  const done = local.filter((item) => item.done).length;

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    const result = await request(`/api/tasks/${taskId}/checklist`, {
      method: "POST",
      body: { title },
    });
    if (result.ok) {
      setDraft("");
      router.refresh();
    }
  }

  async function toggle(item: ChecklistItem) {
    const previous = local;
    setLocal((current) =>
      current.map((row) => (row.id === item.id ? { ...row, done: !row.done } : row)),
    );
    setBusyId(item.id);

    const result = await request(`/api/tasks/${taskId}/checklist/${item.id}`, {
      method: "PATCH",
      body: { done: !item.done },
    });
    if (!result.ok) setLocal(previous);
    setBusyId(null);
  }

  async function remove(item: ChecklistItem) {
    const previous = local;
    setLocal((current) => current.filter((row) => row.id !== item.id));
    const result = await request(`/api/tasks/${taskId}/checklist/${item.id}`, {
      method: "DELETE",
    });
    if (!result.ok) setLocal(previous);
  }

  return (
    <section aria-labelledby="checklist" className="card overflow-hidden">
      <h2 id="checklist" className="flex items-center justify-between border-b border-line px-4 py-3 text-sm font-semibold">
        Чек-лист
        <span className="tnum text-xs font-normal text-ink-subtle">
          {done} из {local.length}
        </span>
      </h2>

      <ul className="divide-y divide-line">
        {local.map((item) => (
          <li key={item.id} className="group flex items-center gap-3 px-4 py-2">
            <button
              type="button"
              onClick={() => toggle(item)}
              disabled={busyId === item.id}
              aria-pressed={item.done}
              aria-label={item.done ? `Снять отметку: ${item.title}` : `Отметить: ${item.title}`}
              className={cn(
                "flex size-4.5 shrink-0 items-center justify-center rounded border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400",
                item.done ? "border-success bg-success text-white" : "border-line hover:border-ink-muted",
              )}
            >
              {busyId === item.id ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : item.done ? (
                <Check className="size-3" aria-hidden />
              ) : null}
            </button>

            <span
              className={cn(
                "min-w-0 flex-1 text-sm",
                item.done && "text-ink-subtle line-through",
              )}
            >
              {item.title}
            </span>

            <button
              type="button"
              onClick={() => remove(item)}
              className="opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Удалить пункт: ${item.title}`}
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={addItem} className="flex gap-2 border-t border-line p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="input h-9"
          placeholder="Ещё один пункт"
          aria-label="Новый пункт чек-листа"
        />
        <button type="submit" className="btn btn-secondary h-9" disabled={pending || !draft.trim()}>
          <Plus className="size-4" aria-hidden />
          Добавить
        </button>
      </form>
    </section>
  );
}
