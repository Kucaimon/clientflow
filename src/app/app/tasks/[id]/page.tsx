import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { activeWorkspaceId } from "@/auth/workspace";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PRIORITY, TASK_STATUS } from "@/lib/status";
import { formatDate, formatDateTime, formatDuration, initials, isOverdue, relativeTime } from "@/lib/format";
import { Checklist } from "@/features/tasks/checklist";
import { CommentForm } from "@/features/tasks/comment-form";
import { AddTimeForm } from "@/features/time/add-time-form";
import { TimeLogRow } from "@/features/time/time-log-row";

export const metadata: Metadata = { title: "Задача" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await activeWorkspaceId();
  const { id } = await params;

  const task = await prisma.task.findFirst({
    where: { id, workspaceId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          client: { select: { id: true, name: true } },
        },
      },
      assignee: { select: { id: true, name: true } },
      reporter: { select: { id: true, name: true } },
      checklistItems: { orderBy: { position: "asc" } },
      comments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      timeEntries: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
        take: 20,
      },
    },
  });
  if (!task) notFound();

  const status = TASK_STATUS[task.status] ?? { label: task.status, tone: "neutral" as const };
  const priority = PRIORITY[task.priority] ?? { label: task.priority, tone: "neutral" as const };
  const spent = task.timeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const late = isOverdue(task.dueDate, task.status);

  // История задачи: отдельной таблицы событий нет, ленту собираем из того,
  // что уже есть — комментарии и записи времени.
  const history = [
    ...task.comments.map((comment) => ({
      id: comment.id,
      at: comment.createdAt,
      who: comment.user.name,
      what: "комментарий",
    })),
    ...task.timeEntries.map((entry) => ({
      id: entry.id,
      at: entry.date,
      who: entry.user.name,
      what: `${formatDuration(entry.minutes)} времени`,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 12);

  return (
    <>
      <Link
        href={task.project ? `/app/projects/${task.project.id}` : "/app/tasks"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-canvas-muted hover:text-on-canvas"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {task.project ? task.project.name : "Задачи"}
      </Link>

      <header className="mb-5">
        <h1 className="text-lg font-semibold tracking-tight">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={priority.tone}>{priority.label}</Badge>
          {task.project ? (
            <Link
              href={`/app/clients/${task.project.client.id}`}
              className="hover:text-accent"
            >
              {task.project.client.name}
            </Link>
          ) : (
            <span>Личная задача</span>
          )}
          {task.dueDate ? (
            <span className={"inline-flex items-center gap-1 " + (late ? "text-danger" : "")}>
              <CalendarDays className="size-4" aria-hidden />
              {formatDate(task.dueDate)}
              {late ? " — срок прошёл" : ""}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Timer className="size-4" aria-hidden />
            {formatDuration(spent)}
            {task.estimate ? ` из ${task.estimate} ч` : ""}
          </span>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section aria-label="Описание задачи" className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Описание</h2>
            {task.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
                {task.description}
              </p>
            ) : (
              <p className="text-sm text-ink-subtle">Описания нет</p>
            )}
            {task.assignee || task.reporter ? (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
                {task.assignee ? (
                  <div>
                    <dt className="text-xs text-ink-subtle">Исполнитель</dt>
                    <dd className="mt-0.5">{task.assignee.name}</dd>
                  </div>
                ) : null}
                {task.reporter ? (
                  <div>
                    <dt className="text-xs text-ink-subtle">Автор</dt>
                    <dd className="mt-0.5">{task.reporter.name}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </section>

          <section aria-label="Обсуждение" className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Обсуждение
              <span className="ml-2 font-normal text-ink-subtle">{task.comments.length}</span>
            </h2>
            <div className="p-4">
              <CommentForm taskId={task.id} />
            </div>
            {task.comments.length === 0 ? (
              <p className="border-t border-line px-4 py-5 text-sm text-ink-muted">
                Комментариев пока нет
              </p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {task.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3 px-4 py-3">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium">
                      {initials(comment.user.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-ink-subtle">
                        {comment.user.name} · {relativeTime(comment.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <Checklist
            taskId={task.id}
            items={task.checklistItems.map((item) => ({
              id: item.id,
              title: item.title,
              done: item.done,
              position: item.position,
            }))}
          />

          <section aria-label="Записать время" className="card p-4">
            <h2 className="mb-3 text-sm font-semibold">Записать время</h2>
            <AddTimeForm taskId={task.id} projectId={task.project?.id ?? null} />
          </section>

          <section aria-label="Время по задаче" className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
              Время ({formatDuration(spent)})
            </h2>
            {task.timeEntries.length === 0 ? (
              <p className="px-4 py-5 text-sm text-ink-muted">Время ещё не ставили</p>
            ) : (
              <ul className="divide-y divide-line">
                {task.timeEntries.map((entry) => (
                  <TimeLogRow
                    key={entry.id}
                    date={entry.date}
                    minutes={entry.minutes}
                    note={entry.note}
                    user={entry.user.name}
                    task={null}
                    billable={entry.billable}
                    invoiced={Boolean(entry.invoiceId)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-label="История задачи" className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">История</h2>
            {history.length === 0 ? (
              <EmptyState title="Событий пока нет" />
            ) : (
              <ul className="divide-y divide-line">
                {history.map((event) => (
                  <li key={event.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{event.who}</span>{" "}
                      <span className="text-ink-muted">{event.what}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {formatDateTime(event.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
