import { prisma } from "@/lib/prisma";
import { AppError, ErrorCodes } from "@/lib/errors";
import { logActivity } from "@/lib/audit";
import type { invoiceCreateSchema, invoiceUpdateSchema } from "@/lib/validation";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;

/**
 * Все деньги в базе — целые копейки, поэтому единственная допустимая
 * операция над суммой — округление до целого. Дробые копейки расходятся
 * с итогом на рубль, а сходимость счёта человек проверяет глазами первым.
 */
const money = (value: number) => Math.round(value);

/**
 * Следующий номер счёта: «год-порядковик».
 *
 * Порядок берём по максимуму из распарсенных чисел, а не по сортировке
 * строк: «2026-004» лексикографически больше «2026-0005», и на mixture
 * форматов нумерация зациклилась бы на уже занятом номере. Номера, которые
 * не распарсились, просто не участвуют в расчёте.
 */
async function nextInvoiceNumber(tx: Prisma.TransactionClient, workspaceId: string, date: Date) {
  const year = date.getUTCFullYear();
  const prefix = `${year}-`;

  const existing = await tx.invoice.findMany({
    where: { workspaceId, number: { startsWith: prefix } },
    select: { number: true },
  });

  let max = 0;
  for (const row of existing) {
    const sequence = Number.parseInt(row.number.slice(prefix.length), 10);
    if (Number.isFinite(sequence) && sequence > max) max = sequence;
  }

  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Итоги счёта всегда пересчитываются из позиций — хранить их раздельно нельзя. */
function totals(items: { quantity: number; unitPrice: number }[], taxRate: number) {
  const subtotal = money(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const total = money(subtotal + (subtotal * taxRate) / 100);
  return { subtotal, total };
}

/**
 * Счёт создаётся черновиком с номером из воркспейса.
 *
 * Позиции принимаем как есть, но суммы считаем сами: количество × ставка.
 * Клиентская сумма в ответе — это то, что человек увидит в PDF, и доверять
 * присланной сумме означало бы расхождение документа с базой.
 */
export async function createInvoice(
  workspaceId: string,
  userId: string,
  input: InvoiceCreateInput,
) {
  const issueDate = input.issueDate ? new Date(input.issueDate) : new Date();
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (dueDate && dueDate < issueDate) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Срок оплаты раньше даты выставления");
  }

  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, workspaceId },
    });
    if (!project) throw new AppError(ErrorCodes.NOT_FOUND, "Проект не найден");
    // Проект обязан принадлежать тому же клиенту, что и счёт: иначе в
    // счёте одного клиента оказываются часы и позиции из чужого проекта.
    if (project.clientId !== input.clientId) {
      throw new AppError(ErrorCodes.NOT_FOUND, "Проект не принадлежит этому клиенту");
    }
  }
  const client = await prisma.client.findFirst({ where: { id: input.clientId, workspaceId } });
  if (!client) throw new AppError(ErrorCodes.NOT_FOUND, "Клиент не найден");

  const items = input.items.map((item, index) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    position: index,
  }));
  const { subtotal, total } = totals(items, input.taxRate);

  return prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, workspaceId, issueDate);

    const created = await tx.invoice.create({
      data: {
        workspaceId,
        clientId: input.clientId,
        projectId: input.projectId ?? null,
        number,
        status: "DRAFT",
        currency: input.currency,
        issueDate,
        dueDate,
        subtotal,
        taxRate: input.taxRate,
        total,
        notes: input.notes ?? null,
        items: { create: items },
      },
      include: { client: { select: { id: true, name: true } }, items: true },
    });

    await logActivity(tx, {
      workspaceId,
      userId,
      entityId: created.id,
      type: "invoice.created",
      meta: { title: number },
    });

    return created;
  });
}

/**
 * Правка счёта.
 *
 * Выставленный счёт не правится: это документ, у которого есть дата и
 * адресат. Меняют его отзывом и новым черновиком.
 */
export async function updateInvoice(
  workspaceId: string,
  invoiceId: string,
  userId: string,
  input: InvoiceUpdateInput,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, workspaceId },
    include: { items: true },
  });
  if (!invoice) throw new AppError(ErrorCodes.NOT_FOUND, "Счёт не найден");
  if (invoice.status !== "DRAFT") {
    throw new AppError(ErrorCodes.CONFLICT, "Выставленный счёт изменить нельзя — отзовите его");
  }

  const items = input.items?.map((item, index) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    position: index,
  }));

  const taxRate = input.taxRate ?? invoice.taxRate;
  const source = items ?? invoice.items;
  const { subtotal, total } = totals(source, taxRate);

  return prisma.$transaction(async (tx) => {
    // Позиции пересоздаются целиком: позиционный список проще держать
    // согласованным, чем сверять «что изменилось, что добавилось».
    if (items) {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceItem.createMany({ data: items.map((item) => ({ ...item, invoiceId: invoice.id })) });
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        clientId: input.clientId,
        projectId: input.projectId === undefined ? undefined : input.projectId,
        currency: input.currency,
        issueDate: input.issueDate ? new Date(input.issueDate) : undefined,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        notes: input.notes,
        taxRate,
        subtotal,
        total,
      },
      include: { client: { select: { id: true, name: true } }, items: { orderBy: { position: "asc" } } },
    });

    await logActivity(tx, {
      workspaceId,
      userId,
      entityId: invoice.id,
      type: "invoice.updated",
      meta: { title: invoice.number },
    });

    return updated;
  });
}

/**
 * Невыставленное время проекта, сгруппированное по задачам.
 *
 * Это сырьё для авто-счёта: часы считаются по задачам, ставка берётся из
 * проекта. Время без ставки не попадает в счёт — лучше явная ошибка, чем
 * счёт на ноль.
 */
export async function unbilledTimeByTask(workspaceId: string, projectId: string) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      workspaceId,
      projectId,
      billable: true,
      invoiceId: null,
      taskId: { not: null },
    },
    include: { task: { select: { id: true, title: true } } },
  });

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    select: { hourlyRate: true },
  });

  const byTask = new Map<string, { taskId: string; title: string; minutes: number; ids: string[] }>();
  for (const entry of entries) {
    if (!entry.task) continue;
    const current = byTask.get(entry.task.id) ?? {
      taskId: entry.task.id,
      title: entry.task.title,
      minutes: 0,
      ids: [],
    };
    current.minutes += entry.minutes;
    current.ids.push(entry.id);
    byTask.set(entry.task.id, current);
  }

  return {
    hourlyRate: project?.hourlyRate ?? null,
    groups: [...byTask.values()].map((group) => ({
      ...group,
      hours: Math.round((group.minutes / 60) * 100) / 100,
    })),
  };
}

/** Пометка времени как выставленного: без неё тот же интервал попадёт в два счёта. */
export async function markTimeBilled(tx: Prisma.TransactionClient, timeIds: string[], invoiceId: string) {
  if (!timeIds.length) return;
  await tx.timeEntry.updateMany({
    where: { id: { in: timeIds } },
    data: { invoiceId },
  });
}
