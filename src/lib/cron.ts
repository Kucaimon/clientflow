/**
 * Задачи планировщика.
 *
 * Сами выборки живут в lib/notifications (их же показывает страница уведомлений):
 * cron и UI должны видеть «просрочено» одинаково, иначе письмо и экран
 * расходятся. Здесь — адаптер: дни + переупаковка для обработчика cron.
 */
import { findOverdueTasks, findRecurringToGenerate } from "@/lib/notifications";
import { daysBetween } from "@/lib/money";

/** Целых дней просрочки; 0, если срок ещё не наступил. */
export function daysOverdue(dueDate: Date, now = new Date()): number {
  return Math.max(0, daysBetween(dueDate, now));
}

export { findOverdueTasks, findRecurringToGenerate };
