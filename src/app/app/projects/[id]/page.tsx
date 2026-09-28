import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleDollarSign, Timer } from "lucide-react";
import { activeWorkspaceId } from "@/auth/workspace";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { PageHeader } from "@/components/ui/page-header";
import { INVOICE_STATUS, PROJECT_STATUS } from "@/lib/status";
import { formatDate, formatDuration, formatMoney, isOverdue } from "@/lib/format";
import { TaskBoard } from "@/features/tasks/task-board";
import { TimeLogRow } from "@/features/time/time-log-row";

export const metadata: Metadata = { title: "Проект" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const workspaceId = await activeWorkspaceId();
  const { id } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { currency: true },
  });
  const currency = workspace?.currency ?? "RUB";

  const project = await prisma.project.findFirst({
    where: { id, workspaceId },
    include: {
      client: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
    },
  });
  if (!project) notFound();

  const [tasks, minutes, openInvoices, invoiced, timeByTask, recentTime, invoices] =
    await Promise.all([
    prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        assignee: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.timeEntry.aggregate({
      where: { project: { id: project.id } },
      _sum: { minutes: true },
    }),
    prisma.invoice.count({
      where: { projectId: project.id, status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID"] } },
    }),
    prisma.invoice.aggregate({
      where: { projectId: project.id, status: { notIn: ["VOID"] } },
      _sum: { total: true },
    }),
    prisma.timeEntry.groupBy({
      by: ["taskId"],
      where: { project: { id: project.id } },
      _sum: { minutes: true },
    }),
    prisma.timeEntry.findMany({
      where: { project: { id: project.id } },
      include: {
        user: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { date: "desc" },
      take: 12,
    }),
    prisma.invoice.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const minutesByTask = new Map(
    timeByTask.map((row) => [row.taskId ?? "", row._sum.minutes ?? 0]),
  );

  const spentMinutes = minutes._sum.minutes ?? 0;
  const status = PROJECT_STATUS[project.status] ?? {
    label: project.status,
    tone: "neutral" as const,
  };

  const stats = [
    {
      label: "Потрачено",
      value: formatMoney(project.spent, currency),
      hint: project.budget ? `из ${formatMoney(project.budget, currency)}` : "бюджет не задан",
      icon: CircleDollarSign,
    },
    { label: "Выставлено", value: formatMoney(invoiced._sum.total ?? 0, currency), hint: `${openInvoices} не оплачено`, icon: Timer },
    { label: "Время", value: formatDuration(spentMinutes), hint: project.hoursBudget ? `план ${project.hoursBudget} ч` : "план не задан", icon: Timer },
  ];

  return (
    <>
      <Link
        href="/app/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-on-canvas-muted hover:text-on-canvas"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Проекты
      </Link>

      <PageHeader
        title={project.name}
        description={
          project.manager
            ? `${project.client.name} · ведущий: ${project.manager.name}`
            : project.client.name
        }
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <dl className="mb-5 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4">
            <dt className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <stat.icon className="size-3.5" aria-hidden />
              {stat.label}
            </dt>
            <dd className="tnum mt-1 text-lg font-semibold tracking-tight">{stat.value}</dd>
            <dd className="mt-0.5 text-xs text-ink-subtle">{stat.hint}</dd>
          </div>
        ))}
      </dl>

      {project.dueDate ? (
        <p
          className={
            "mb-4 inline-flex items-center gap-1.5 text-sm " +
            (isOverdue(project.dueDate, project.status) ? "text-danger" : "text-ink-muted")
          }
        >
          <CalendarDays className="size-4" aria-hidden />
          Срок сдачи {formatDate(project.dueDate)}
        </p>
      ) : null}

      <section aria-label="Задачи проекта">
        <h2 className="mb-3 text-sm font-semibold">
          Задачи
          <span className="ml-2 font-normal text-ink-subtle">{tasks.length}</span>
        </h2>

        {tasks.length === 0 ? (
          <EmptyState
            title="В проекте пока нет задач"
            description="Добавьте первую задачу в колонку «Бэклог»."
          />
        ) : (
          <TaskBoard
            projectId={project.id}
            members={project.members.map((member) => member.user)}
            tasks={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              position: task.position,
              dueDate: task.dueDate ? task.dueDate.toISOString() : null,
              estimate: task.estimate,
              assignee: task.assignee,
              spentMinutes: minutesByTask.get(task.id) ?? 0,
              comments: task._count.comments,
            }))}
          />
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="project-time" className="card overflow-hidden">
          <h2 id="project-time" className="border-b border-line px-4 py-3 text-sm font-semibold">
            Последние записи времени
          </h2>
          {recentTime.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">Время ещё не ставили</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentTime.map((entry) => (
                <TimeLogRow
                  key={entry.id}
                  date={entry.date}
                  minutes={entry.minutes}
                  note={entry.note}
                  user={entry.user.name}
                  task={entry.task?.title ?? null}
                  billable={entry.billable}
                  invoiced={Boolean(entry.invoiceId)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="project-invoices" className="card overflow-hidden">
          <h2 id="project-invoices" className="border-b border-line px-4 py-3 text-sm font-semibold">
            Счета проекта
          </h2>
          {invoices.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">Счетов ещё нет</p>
          ) : (
            <ul className="divide-y divide-line">
              {invoices.map((invoice) => {
                const invoiceStatus = INVOICE_STATUS[invoice.status] ?? {
                  label: invoice.status,
                  tone: "neutral" as const,
                };
                return (
                  <li key={invoice.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <Link
                      href={`/app/invoices/${invoice.id}`}
                      className="tnum min-w-0 flex-1 truncate hover:text-accent"
                    >
                      {invoice.number}
                    </Link>
                    <Badge tone={invoiceStatus.tone}>{invoiceStatus.label}</Badge>
                    <span className="tnum w-24 text-right font-medium">
                      {formatMoney(invoice.total, invoice.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
