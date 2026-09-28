"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarDays, MessageSquare, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY } from "@/lib/status";
import { formatDate } from "@/lib/format";
import { initials } from "@/lib/format";
import type { BoardTask } from "./types";

function CardBody({ task, dragging }: { task: BoardTask; dragging: boolean }) {
  const priority = PRIORITY[task.priority] ?? { label: task.priority, tone: "neutral" as const };
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";

  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-white p-3",
        dragging && "ring-2 ring-accent",
      )}
    >
      <p className="text-sm leading-snug">{task.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
        <span
          className={cn(
            "inline-flex items-center gap-1",
            priority.tone === "danger" && "text-danger",
            priority.tone === "warning" && "text-warning",
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {priority.label}
        </span>

        {task.dueDate ? (
          <span className={cn("inline-flex items-center gap-1", overdue && "text-danger")}>
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDate(task.dueDate)}
          </span>
        ) : null}

        {task.spentMinutes ? (
          <span className="inline-flex items-center gap-1">
            <Timer className="size-3.5" aria-hidden />
            {Math.round(task.spentMinutes / 60)} ч
          </span>
        ) : null}

        {task.comments ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" aria-hidden />
            {task.comments}
          </span>
        ) : null}

        {task.assignee ? (
          <span
            title={task.assignee.name}
            className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium"
          >
            {initials(task.assignee.name)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Карточка на доске.
 *
 * Ссылка внутри карточки намеренно отсутствует: клик по карточке — это
 * жест перетаскивания, а открыть задачу можно двойным кликом по заголовку.
 */
export function TaskCard({ task }: { task: BoardTask }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-40")}
      aria-label={`Задача: ${task.title}`}
    >
      <CardBody task={task} dragging={false} />
    </div>
  );
}

/** Тот же вид, что у перетаскиваемой карточки, — для оверлея под курсором. */
export function TaskCardPreview({ task }: { task: BoardTask }) {
  return (
    <div className="w-72 rotate-2">
      <CardBody task={task} dragging />
    </div>
  );
}
