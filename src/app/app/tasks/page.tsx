import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { activeWorkspaceId } from "@/auth/workspace";
import { requireUser } from "@/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PRIORITY, TASK_STATUS } from "@/lib/status";
import { formatDate, formatDuration, initials, isOverdue } from "@/lib/format";
import { TaskBoard } from "@/features/tasks/task-board";

export const metadata: Metadata = { title: "Задачи" };

const STATUS_FILTERS = [
  { value: "", label: "Все" },
  { value: "TODO", label: "К работе" },
  { value: "IN_PROGRESS", label: "В работе" },
  { value: "REVIEW", label: "На проверке" },
  { value: "DONE", label: "Готово" },
];

type Search = { q?: string; status?: string; mine?: string; view?: string };

/**
 * Переключение «список ↔ доска» не должно сбрасывать фильтры: человек
 * ищет по строке и статусу, а вид меняет по ходу дела.
 */
function buildViewHref(params: Search) {
  const query = new URLSearchParams();
  for (const key of ["q", "status", "mine"] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  if (params.view !== "board") query.set("view", "board");
  const search = query.toString();
  return search ? `/app/tasks?${search}` : "/app/tasks";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const [workspaceId, me] = await Promise.all([activeWorkspaceId(), requireUser()]);
  const params = await searchParams;
  const mine = params.mine === "1";
  const board = params.view === "board";

  const where: Record<string, unknown> = { workspaceId };
  if (params.status) where.status = params.status;
  if (params.q) where.title = { contains: params.q };
  if (mine) where.assigneeId = me.id;

  const [tasks, members] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
        timeEntries: { select: { minutes: true } },
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { currency: true } }),
  ]);

  const open = tasks.filter((task) => task.status !== "DONE" && task.status !== "CANCELED");
  const overdue = open.filter((task) => isOverdue(task.dueDate, task.status));

  return (
    <>
      <PageHeader
        title="Задачи"
        description={
          mine
            ? "Задачи, назначенные вам"
            : `${open.length} открытых, ${overdue.length} с просроченным сроком`
        }
        actions={
          <Link
            href={buildViewHref(params)}
            className="btn btn-ghost"
          >
            {board ? "Списком" : "Доской"}
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Suspense>
          <FilterTabs param="status" tabs={STATUS_FILTERS} />
        </Suspense>
        <Suspense>
          <SearchInput label="Поиск задачи" placeholder="Заголовок" />
        </Suspense>
        <Link
          href={mine ? "/app/tasks" : "/app/tasks?mine=1"}
          className={
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[13px] transition-colors " +
            (mine
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900")
          }
        >
          Только мои
        </Link>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title={mine ? "На вас нет задач" : "Задач не найдено"}
          description={
            mine
              ? "Задачи назначает ведущий проекта — загляните в общий список."
              : "Измените фильтр или создайте задачу на доске проекта."
          }
        />
      ) : board ? (
        <TaskBoard
          members={members.map((member) => member.user)}
          tasks={tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            position: task.position,
            dueDate: task.dueDate ? task.dueDate.toISOString() : null,
            estimate: task.estimate,
            assignee: task.assignee,
            spentMinutes: task.timeEntries.reduce((sum, e) => sum + e.minutes, 0),
            comments: task._count.comments,
          }))}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Список задач</caption>
            <thead className="bg-surface-muted text-left text-xs text-ink-subtle">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">Задача</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Проект</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Статус</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Приоритет</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Исполнитель</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Срок</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tasks.map((task) => {
                const status = TASK_STATUS[task.status] ?? {
                  label: task.status,
                  tone: "neutral" as const,
                };
                const priority = PRIORITY[task.priority] ?? {
                  label: task.priority,
                  tone: "neutral" as const,
                };
                const late = isOverdue(task.dueDate, task.status);
                const href = `/app/tasks/${task.id}`;
                return (
                  <tr key={task.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <Link href={href} className="font-medium hover:text-accent">
                        {task.title}
                      </Link>
                      {task.timeEntries.length ? (
                        <span className="block text-xs text-ink-subtle">
                          {formatDuration(task.timeEntries.reduce((sum, e) => sum + e.minutes, 0))} в работе
                        </span>
                      ) : null}
                    </td>
                    <td className="truncate px-4 py-3 text-ink-muted">
                      {task.project ? (
                        <Link
                          href={`/app/projects/${task.project.id}`}
                          className="hover:text-accent"
                        >
                          {task.project.name}
                        </Link>
                      ) : (
                        "Личное"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{priority.label}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {task.assignee ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium">
                            {initials(task.assignee.name)}
                          </span>
                          {task.assignee.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={
                        "tnum px-4 py-3 text-right " +
                        (late ? "text-danger" : "text-ink-muted")
                      }
                    >
                      {task.dueDate ? formatDate(task.dueDate) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
