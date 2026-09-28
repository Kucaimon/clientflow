"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";

/**
 * Ручная запись времени на задачу.
 *
 * Форму не прячем под таймер: время часто вспоминают вечером, и ввод
 * «2 часа вчера» нужен чаще, чем трекер по секундам.
 */
export function AddTimeForm({
  taskId,
  projectId,
  defaultBillable = true,
}: {
  taskId: string;
  projectId: string | null;
  defaultBillable?: boolean;
}) {
  const [minutes, setMinutes] = useState("60");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [billable, setBillable] = useState(defaultBillable);
  const { request, pending } = useApi();
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return;

    const result = await request("/api/time-entries", {
      method: "POST",
      body: { taskId, projectId, minutes: Math.round(value), date, note, billable },
    });
    if (result.ok) {
      setNote("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Минут" htmlFor="minutes">
          <input
            id="minutes"
            type="number"
            min={1}
            max={1440}
            className="input tnum"
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </Field>
        <Field label="Дата" htmlFor="date">
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Что делали" htmlFor="time-note">
        <input
          id="time-note"
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Например: правки после созвона"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={billable}
          onChange={(event) => setBillable(event.target.checked)}
          className="size-4 rounded border-line"
        />
        Оплачивается
      </label>

      <div className="flex justify-end">
        <button type="submit" className="btn btn-secondary h-9" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Записать
        </button>
      </div>
    </form>
  );
}
