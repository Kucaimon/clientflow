import { formatDate } from "@/lib/format";

/**
 * Строка журнала времени.
 *
 * Отмечена запись, уже попавшая в счёт: повторно выставить её — значит
 * выставить клиенту двойную сумму, и видно это должно быть до того, как
 * кто-то нажмёт «выставить счёт».
 */
export function TimeLogRow({
  date,
  minutes,
  note,
  user,
  task,
  billable,
  invoiced,
}: {
  date: Date | string;
  minutes: number;
  note: string | null;
  user: string;
  task: string | null;
  billable: boolean;
  invoiced: boolean;
}) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return (
    <li className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
      <span className="tnum shrink-0 text-xs text-ink-subtle">{formatDate(date)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{note || task || "Без описания"}</span>
        <span className="block truncate text-xs text-ink-subtle">
          {user}
          {task && note ? ` · ${task}` : ""}
        </span>
      </span>
      {invoiced ? (
        <span className="shrink-0 text-xs text-success">в счёте</span>
      ) : !billable ? (
        <span className="shrink-0 text-xs text-ink-subtle">не billed</span>
      ) : null}
      <span className="tnum w-16 shrink-0 text-right font-medium">
        {hours > 0 ? `${hours} ч ${rest} м` : `${rest} м`}
      </span>
    </li>
  );
}
