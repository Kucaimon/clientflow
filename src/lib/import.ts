/**
 * Восстановление воркспейса из файла экспорта.
 *
 * Импорт всегда создаёт НОВЫЙ воркспейс и никогда ничего не перезаписывает:
 * «слить» дамп с текущими данными нельзя, не придумав правило разрешения
 * конфликтов по каждой строке, а молча потерять счета хуже лишний клик.
 *
 * Люди в дампе не восстанавливаются: чужие аккаунты заводить некому, поэтому
 * все ссылки на пользователей схлопываются в того, кто импорт запускает.
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/errors";
import { CURRENCIES } from "@/lib/format";

/**
 * Поля читаются опционально везде, где их отсутствие не ломает данные:
 * файл мог быть выгружен более старой версией приложения, и падать на этом
 * — значит лишить человека возможности перенести работу.
 */
const exportSchema = z.object({
  version: z.number().int().min(1),
  workspace: z.object({
    name: z.string().min(1),
    currency: z.string().optional(),
  }),
  clients: z.array(z.record(z.string(), z.unknown())),
  projects: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
  timeEntries: z.array(z.record(z.string(), z.unknown())),
  invoices: z.array(z.record(z.string(), z.unknown())),
  labels: z.array(z.record(z.string(), z.unknown())).default([]),
});

export type ExportPayload = z.input<typeof exportSchema>;

const str = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" ? (row[key] as string) : null;
const num = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "number" ? (row[key] as number) : null;

export type ImportResult = {
  workspaceId: string;
  name: string;
  counts: Record<string, number>;
  /** Что не удалось перенести молча: человек должен увидеть, что импорт не полный. */
  warnings: string[];
};

export async function importWorkspace(raw: unknown, userId: string): Promise<ImportResult> {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      "Файл не похож на выгрузку ClientFlow",
      parsed.error.issues.slice(0, 5),
    );
  }
  const data = parsed.data;

  const warnings: string[] = [];
  const currency = CURRENCIES.includes(data.workspace.currency as (typeof CURRENCIES)[number])
    ? data.workspace.currency!
    : "RUB";

  const workspace = await prisma.workspace.create({
    data: { name: `${data.workspace.name} (импорт)`, currency },
  });
  // Импорт запускает человек, и он же остаётся владельцем нового воркспейса:
  // без членства созданный воркспейс был бы недоступен никому.
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId, role: "OWNER" },
  });

  const clientIds = new Map<string, string>();
  for (const row of data.clients) {
    const sourceId = str(row, "id");
    const name = str(row, "name");
    if (!sourceId || !name) {
      warnings.push("Клиент без названия пропущен");
      continue;
    }
    const created = await prisma.client.create({
      data: {
        workspaceId: workspace.id,
        name,
        email: str(row, "email"),
        phone: str(row, "phone"),
        industry: str(row, "industry"),
        website: str(row, "website"),
        note: str(row, "note"),
        archivedAt: row.archivedAt ? new Date(String(row.archivedAt)) : null,
      },
    });
    clientIds.set(sourceId, created.id);
  }

  const projectIds = new Map<string, string>();
  for (const row of data.projects) {
    const sourceId = str(row, "id");
    const name = str(row, "name");
    const clientId = clientIds.get(str(row, "clientId") ?? "");
    if (!sourceId || !name) continue;
    if (!clientId) {
      // Проект без клиента в схеме обязателен: привязку восстановить не из чего.
      warnings.push(`Проект «${name}» пропущен — клиент в файле не найден`);
      continue;
    }
    const created = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        name,
        description: str(row, "description"),
        status: (str(row, "status") ?? "ACTIVE") as never,
        budget: num(row, "budget"),
        spent: num(row, "spent") ?? 0,
        hoursBudget: num(row, "hoursBudget"),
        hourlyRate: num(row, "hourlyRate"),
        dueDate: row.dueDate ? new Date(String(row.dueDate)) : null,
        billingType: str(row, "billingType") ?? "HOURLY",
        // Ведущий проекта из дампа нам не принадлежит — оставляем пустым.
        managerId: null,
      },
    });
    projectIds.set(sourceId, created.id);
  }

  const taskIds = new Map<string, string>();
  for (const row of data.tasks) {
    const sourceId = str(row, "id");
    const title = str(row, "title");
    if (!sourceId || !title) continue;
    const projectId = str(row, "projectId");
    const created = await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        projectId: projectId ? (projectIds.get(projectId) ?? null) : null,
        title,
        description: str(row, "description"),
        status: (str(row, "status") ?? "TODO") as never,
        priority: (str(row, "priority") ?? "MEDIUM") as never,
        position: num(row, "position") ?? 0,
        estimate: num(row, "estimate"),
        dueDate: row.dueDate ? new Date(String(row.dueDate)) : null,
        assigneeId: str(row, "assigneeId") ? userId : null,
        reporterId: str(row, "reporterId") ? userId : null,
      },
    });
    taskIds.set(sourceId, created.id);

    const checklist = Array.isArray(row.checklistItems) ? (row.checklistItems as never[]) : [];
    for (const item of checklist) {
      const record = item as Record<string, unknown>;
      const title = str(record, "title");
      if (!title) continue;
      await prisma.checklistItem.create({
        data: {
          taskId: created.id,
          title,
          done: Boolean(record.done),
          position: num(record, "position") ?? 0,
        },
      });
    }

    const comments = Array.isArray(row.comments) ? (row.comments as never[]) : [];
    for (const item of comments) {
      const record = item as Record<string, unknown>;
      const body = str(record, "body");
      if (!body) continue;
      await prisma.taskComment.create({
        data: {
          taskId: created.id,
          userId,
          body,
          createdAt: record.createdAt ? new Date(String(record.createdAt)) : new Date(),
        },
      });
    }
  }

  // У записей времени уникальность по (user, task, date). Люди в дампе
  // схлопнулись в одного, поэтому однодневки разных авторов сталкиваются —
  // их складываем, иначе импорт упал бы на уникальности.
  const seenTime = new Map<string, string>();
  let mergedTime = 0;
  for (const row of data.timeEntries) {
    const taskId = str(row, "taskId");
    const projectId = str(row, "projectId");
    const minutes = num(row, "minutes") ?? 0;
    const date = row.date ? new Date(String(row.date)) : null;
    if (!date || minutes <= 0) continue;

    const newTaskId = taskId ? (taskIds.get(taskId) ?? null) : null;
    const newProjectId = projectId ? (projectIds.get(projectId) ?? null) : null;
    const key = `${newTaskId ?? newProjectId ?? "free"}:${date.toISOString().slice(0, 10)}`;

    const existingId = seenTime.get(key);
    if (existingId) {
      await prisma.timeEntry.update({
        where: { id: existingId },
        data: { minutes: { increment: minutes } },
      });
      mergedTime += 1;
      continue;
    }

    const created = await prisma.timeEntry.create({
      data: {
        workspaceId: workspace.id,
        userId,
        taskId: newTaskId,
        projectId: newProjectId,
        date,
        minutes,
        billable: row.billable === undefined ? true : Boolean(row.billable),
        note: str(row, "note"),
      },
    });
    seenTime.set(key, created.id);
  }
  if (mergedTime) {
    warnings.push(`${mergedTime} записей времени совпали по задаче и дате — минуты сложены`);
  }

  for (const row of data.labels) {
    const name = str(row, "name");
    if (!name) continue;
    await prisma.label.create({
      data: { workspaceId: workspace.id, name, color: str(row, "color") ?? "#888888" },
    });
  }

  // Номера счетов уникальны в воркспейсе: новый воркспейс пуст, поэтому
  // конфликты возможны только внутри самого файла.
  const usedNumbers = new Set<string>();
  for (const row of data.invoices) {
    const clientId = clientIds.get(str(row, "clientId") ?? "");
    if (!clientId) {
      warnings.push(`Счёт ${str(row, "number") ?? "без номера"} пропущен — клиент не найден`);
      continue;
    }

    let number = str(row, "number") ?? "";
    if (!number || usedNumbers.has(number)) {
      number = number ? `${number}-импорт` : "—";
    }
    usedNumbers.add(number);

    const created = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId,
        projectId: str(row, "projectId") ? (projectIds.get(str(row, "projectId")!) ?? null) : null,
        number,
        status: (str(row, "status") ?? "DRAFT") as never,
        currency: str(row, "currency") ?? currency,
        issueDate: row.issueDate ? new Date(String(row.issueDate)) : new Date(),
        dueDate: row.dueDate ? new Date(String(row.dueDate)) : null,
        sentAt: row.sentAt ? new Date(String(row.sentAt)) : null,
        paidAt: row.paidAt ? new Date(String(row.paidAt)) : null,
        notes: str(row, "notes"),
        subtotal: num(row, "subtotal") ?? 0,
        taxRate: num(row, "taxRate") ?? 0,
        total: num(row, "total") ?? 0,
      },
    });

    const items = Array.isArray(row.items) ? (row.items as never[]) : [];
    for (const item of items) {
      const record = item as Record<string, unknown>;
      const description = str(record, "description");
      if (!description) continue;
      await prisma.invoiceItem.create({
        data: {
          invoiceId: created.id,
          description,
          quantity: num(record, "quantity") ?? 1,
          unitPrice: num(record, "unitPrice") ?? 0,
          position: num(record, "position") ?? 0,
        },
      });
    }

    const payments = Array.isArray(row.payments) ? (row.payments as never[]) : [];
    for (const payment of payments) {
      const record = payment as Record<string, unknown>;
      const amount = num(record, "amount") ?? 0;
      if (amount <= 0) continue;
      await prisma.invoicePayment.create({
        data: {
          invoiceId: created.id,
          amount,
          date: record.date ? new Date(String(record.date)) : new Date(),
          method: str(record, "method"),
          note: str(record, "note"),
        },
      });
    }
  }

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    counts: {
      clients: clientIds.size,
      projects: projectIds.size,
      tasks: taskIds.size,
      timeEntries: data.timeEntries.length,
      invoices: data.invoices.length,
    },
    warnings,
  };
}
