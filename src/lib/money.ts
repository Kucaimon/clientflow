/**
 * Деньги и длительности.
 *
 * Суммы храним в копейках (Int): float в деньгах даёт накопленную погрешность,
 * а «итог» счёта сходится только при целочисленной арифметике. Проценты и
 * часы — единственное место, где дробь допустима, и она округляется здесь.
 */

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/** Копейки в часы (для ставок и отчётов). */
export const minutesToHours = (minutes: number): number => round2(minutes / 60);

/** Копейки → рубли с двумя знаками; для отображения, не для расчётов. */
export function formatMoney(kopecks: number, currency = "RUB"): string {
  const amount = (kopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount} ${currency}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Целые дни между двумя датами (отрицательные — «в будущем»). */
export function daysBetween(from: Date, to: Date): number {
  const MS = 24 * 60 * 60 * 1000;
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS);
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Доля от целого в процентах, для прогресс-баров; 0 при пустом знаменателе. */
export const percent = (part: number, total: number): number =>
  total > 0 ? round2((part / total) * 100) : 0;
