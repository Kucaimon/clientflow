"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { TASK_COLUMNS, TASK_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { BoardMember, BoardTask } from "./types";
import { TaskCard, TaskCardPreview } from "./task-card";
import { AddTaskButton } from "./add-task-button";

/**
 * Канбан проекта.
 *
 * Перенос карточки между колонками — это PATCH /api/tasks/:id со статусом.
 * Доска обновляется оптимистично и откатывает состояние, если сервер
 * возразил: без отката одно неудачное движение оставляет фантомную задачу.
 */
function Column({
  status,
  tasks,
  overStatus,
  projectId,
  members,
}: {
  status: string;
  tasks: BoardTask[];
  overStatus: string | null;
  projectId: string | null;
  members: BoardMember[];
}) {
  const { setNodeRef } = useDroppable({ id: status });
  const meta = TASK_STATUS[status] ?? { label: status };

  return (
    <section
      ref={setNodeRef}
      aria-label={meta.label}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-surface-muted/60 transition-colors",
        overStatus === status ? "border-accent bg-accent/5" : "border-line",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h3 className="text-[13px] font-semibold">{meta.label}</h3>
        <span className="tnum text-xs text-ink-subtle">{tasks.length}</span>
      </header>

      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-subtle">
            Пусто
          </p>
        ) : null}

        <AddTaskButton projectId={projectId} status={status} members={members} />
      </div>
    </section>
  );
}

export function TaskBoard({
  projectId,
  members,
  tasks: initialTasks,
}: {
  projectId?: string | null;
  members: BoardMember[];
  tasks: BoardTask[];
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const status of TASK_COLUMNS) map.set(status, []);
    for (const task of tasks) {
      // Задача в статусе вне колонок (CANCELED) не рисуется, но остаётся в данных.
      map.get(task.status)?.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [tasks]);

  const active = activeId ? tasks.find((task) => task.id === activeId) : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragOver(event: DragOverEvent) {
    const over = event.over?.id.toString();
    setOverStatus(over && TASK_COLUMNS.includes(over as never) ? over : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active: dragged, over } = event;
    setActiveId(null);
    setOverStatus(null);
    if (!over) return;

    const target = over.id.toString();
    if (!TASK_COLUMNS.includes(target as never)) return;

    const task = tasks.find((item) => item.id === dragged.id);
    if (!task || task.status === target) return;

    const previous = tasks;
    // Ниже последней карточки колонки: позиция +1 держит порядок стабильным.
    const siblings = byColumn.get(target) ?? [];
    const position = (siblings[siblings.length - 1]?.position ?? 0) + 1;

    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, status: target, position } : item)),
    );

    startTransition(async () => {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: target, position }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setTasks(previous);
        toast({
          title: "Задача не перенесена",
          description: payload.error?.message ?? `Ошибка ${res.status}`,
          variant: "error",
        });
        return;
      }

      router.refresh();
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverStatus(null);
      }}
    >
      <div
        className={cn(
          "-mx-1 flex gap-3 overflow-x-auto px-1 pb-2",
          pending && "opacity-70 transition-opacity",
        )}
      >
        {TASK_COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={byColumn.get(status) ?? []}
            overStatus={overStatus}
            projectId={projectId ?? null}
            members={members}
          />
        ))}
      </div>

      <DragOverlay>{active ? <TaskCardPreview task={active} /> : null}</DragOverlay>
    </DndContext>
  );
}
