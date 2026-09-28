/**
 * Деньги храним в копейках (целые), поэтому форматирование — единственное место,
 * где появляется дробь. Формат держим в одном модуле: разбросанные toFixed
 * расходятся между таблицей, счётом и дашбордом.
 */
/** Валюты, которые приложение умеет показывать без локализационных сюрпризов. */
export const CURRENCIES = ["USD", "EUR", "RUB", "GEL"] as const;

export type Currency = (typeof CURRENCIES)[number];

/**
 * Строка из базы — кандидат на валюту.
 * В схеме валюты перечислены строкой, а формы ждут союз: проверка нужна,
 * чтобы значение, добавленное миграцией раньше UI, не ломало рендер.
 */
export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** Подписи для селекта валюты: код + привычный символ, чтобы не гадать по ISO. */
export const CURRENCY_LABEL: Record<string, string> = {
  USD: "USD — доллар",
  EUR: "EUR — евро",
  RUB: "RUB — рубль",
  GEL: "GEL — лари",
};

export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}

/** Только время — для ленты событий, где дата уже вынесена в заголовок группы. */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** «5 мин назад» вместо абсолютной даты там, где важен порядок, а не момент. */
export function relativeTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return formatDate(date);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/**
 * Просрочка считается по календарному дню, а не по «now > dueDate»:
 * дедлайн в 00:00 утра формально просрочен весь день, и клиенту это выглядит
 * как баг, а не как правило.
 */
export function isOverdue(
  due: Date | string | null | undefined,
  status?: string | null,
): boolean {
  // Завершённое не просрочено, даже если дата в прошлом: у счёта это PAID/VOID,
  // у проекта DONE/ARCHIVED.
  if (status === "PAID" || status === "VOID" || status === "DONE" || status === "ARCHIVED") {
    return false;
  }
  if (!due) return false;
  const date = typeof due === "string" ? new Date(due) : due;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
