import type { BadgeTone } from "@/components/ui/badge";

/**
 * Подписи и тона статусов в одном месте: перевод и цвета не расходятся
 * между таблицей, карточкой и фильтром.
 */
export const PROJECT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "В работе", tone: "accent" },
  ON_HOLD: { label: "Приостановлен", tone: "warning" },
  DONE: { label: "Завершён", tone: "success" },
  ARCHIVED: { label: "В архиве", tone: "neutral" },
};

export const TASK_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  BACKLOG: { label: "Бэклог", tone: "neutral" },
  TODO: { label: "К работе", tone: "neutral" },
  IN_PROGRESS: { label: "В работе", tone: "accent" },
  REVIEW: { label: "На проверке", tone: "warning" },
  DONE: { label: "Готово", tone: "success" },
  CANCELED: { label: "Отменена", tone: "danger" },
};

export const TASK_COLUMNS = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;

export const PRIORITY: Record<string, { label: string; tone: BadgeTone }> = {
  LOW: { label: "Низкий", tone: "neutral" },
  MEDIUM: { label: "Средний", tone: "neutral" },
  HIGH: { label: "Высокий", tone: "warning" },
  URGENT: { label: "Срочный", tone: "danger" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SENT: { label: "Отправлен", tone: "accent" },
  PARTIALLY_PAID: { label: "Частично оплачен", tone: "warning" },
  OVERDUE: { label: "Просрочен", tone: "danger" },
  PAID: { label: "Оплачен", tone: "success" },
  VOID: { label: "Аннулирован", tone: "neutral" },
};

export const PAYMENT_METHOD: Record<string, string> = {
  CARD: "Карта",
  CASH: "Наличные",
  TRANSFER: "Перевод",
  OTHER: "Другое",
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: "Владелец",
  VIEWER: "Наблюдатель",
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  MEMBER: "Сотрудник",
};

export const ACTIVITY_LABEL: Record<string, string> = {
  "workspace.created": "создал(а) воркспейс",
  "workspace.updated": "изменил(а) настройки воркспейса",
  "workspace.deleted": "удалил(а) воркспейс",
  "client.created": "добавил(а) клиента",
  "client.updated": "обновил(а) клиента",
  "client.archived": "архивировал(а) клиента",
  "client.restored": "вернул(а) клиента из архива",
  "client.deleted": "удалил(а) клиента",
  "project.created": "создал(а) проект",
  "project.updated": "обновил(а) проект",
  "project.status_changed": "поменял(а) статус проекта",
  "project.deleted": "удалил(а) проект",
  "task.created": "создал(а) задачу",
  "task.updated": "обновил(а) задачу",
  "task.status_changed": "перенёс(ла) задачу",
  "task.deleted": "удалил(а) задачу",
  "comment.created": "прокомментировал(а)",
  "time.created": "записал(а) время",
  "time.updated": "поправил(а) запись времени",
  "time.deleted": "удалил(а) запись времени",
  "invoice.created": "выставил(а) счёт",
  "invoice.updated": "изменил(а) счёт",
  "invoice.sent": "отправил(а) счёт",
  "invoice.paid": "отметил(а) оплату счёта",
  "invoice.voided": "аннулировал(а) счёт",
  "invoice.deleted": "удалил(а) счёт",
  "invoice.status_changed": "изменил(а) статус счёта",
  "payment.created": "внёс(ла) оплату",
  "member.invited": "пригласил(а) в команду",
  "member.joined": "присоединился(ась) к команде",
  "member.role_changed": "сменил(а) роль",
  "member.removed": "удалил(а) из команды",
};

export function activityText(type: string, meta: Record<string, unknown> = {}): string {
  const label = ACTIVITY_LABEL[type] ?? type;
  const subject = meta.title ?? meta.name;
  return subject ? `${label} «${subject}»` : label;
}
