/**
 * Схемы ввода: единственная граница, где непроверенные данные превращаются
 * в типы. Роут не должен проверять `if (!body.title)` — это делает схема,
 * а роут получает уже корректный объект.
 *
 * Правила, которые повторяются:
 *  · строки режем по краям и запрещаем пустые после обрезки;
 *  · даты принимаем и ISO-строкой, и Date (форм зависит от контрола);
 *  · enum'ы — строго значения из Prisma: лишнее состояние в базе дороже,
 *    чем лишний импорт здесь.
 */
import { z } from "zod";
import { CURRENCIES } from "@/lib/format";

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} не может быть пустым`)
    .max(max, `${label}: не длиннее ${max} символов`)
    .refine((value) => value.length >= min, `${label}: минимум ${min} символов`);

const optionalText = (max: number) =>
  z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().max(max).optional());

const idParam = z.string().trim().min(1);

/** Date | ISO-строка → Date. Контроли формата разные, граница одна. */
const dateLike = z.union([z.date(), z.string().min(1)]).transform((value) =>
  value instanceof Date ? value : new Date(value),
);

const optionalId = z.preprocess(
  (value) => (value === "" || value === "undefined" || value === "null" ? undefined : value),
  idParam.optional(),
);

const booleanish = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((value) => value === true || value === "true" || value === "1");

const positiveInt = (fallback: number, max: number) => (value: string | undefined) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
};

const numeric = z.coerce.number().int().min(0);

// ─── Roles: лестница VIEWER < MEMBER < ADMIN < OWNER ───────────────────────
export const ROLES = ["VIEWER", "MEMBER", "MANAGER", "ADMIN", "OWNER"] as const;
export const roleSchema = z.enum(ROLES);
export const assignableRoleSchema = z.enum(["MEMBER", "MANAGER", "ADMIN", "OWNER"]);

// ─── Статусы из Prisma ─────────────────────────────────────────────────────
export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "DONE", "ARCHIVED"] as const;
export const TASK_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE", "CANCELED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "VOID"] as const;
export const BILLING_TYPES = ["FIXED", "HOURLY", "RETAINER"] as const;
export const PAYMENT_METHODS = ["CARD", "CASH", "TRANSFER", "OTHER"] as const;
export const RECURRENCE_INTERVALS = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export const recurrenceIntervalSchema = z.enum(RECURRENCE_INTERVALS);

// ─── Пагинация и поиск ─────────────────────────────────────────────────────
/**
 * Числа из query приходят строками, а «page=-5» не должно превращаться в
 * отрицательный skip: границы зашиты здесь, а не в каждом роуте.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationWithSearchSchema = paginationSchema.extend({
  q: optionalText(120),
});

const csvIds = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}, z.array(idParam).optional());

// ─── Auth ──────────────────────────────────────────────────────────────────
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email обязателен")
  .email("Непохоже на email")
  .transform((value) => value.toLowerCase());

/**
 * Пароль: минимум разумного, без экзотики. Проверка «не тот пароль» — на
 * сервере при входе; здесь только форма, чтобы не отправлять заведомо пустое.
 */
export const passwordSchema = z
  .string()
  .min(8, "Пароль: минимум 8 символов")
  .max(200, "Пароль слишком длинный");

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });

/**
 * Строгая схема: роль и поля воркспейса пришельцу не отдаём.
 *
 * По умолчанию zod лишние ключи выбрасывает молча, и «role: OWNER» в теле
 * выглядело бы безобидно. Отказ здесь честнее: клиент сразу видит, что
 * просит невозможного.
 */
export const registerSchema = z
  .object({
    name: trimmed(2, 80, "Имя"),
    email: emailSchema,
    password: passwordSchema,
    workspaceName: optionalText(60),
  })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({ token: idParam, password: passwordSchema });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: passwordSchema,
});

/** Правка профиля: имя и, отдельно, смена пароля. */
export const profileUpdateSchema = z
  .object({
    name: trimmed(2, 80, "Имя"),
    email: emailSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

// ─── Воркспейс ─────────────────────────────────────────────────────────────
// Список валют живёт в lib/format: там же, где и форматирование. Держать
// второй список здесь — значит ловить валюту, которую UI показывает, но
// не принимает сервер.
const currencySchema = z.enum(CURRENCIES);

export const workspaceCreateSchema = z.object({
  name: trimmed(2, 60, "Название воркспейса"),
  currency: currencySchema.default("RUB"),
});

export const workspaceUpdateSchema = z
  .object({
    name: trimmed(2, 60, "Название воркспейса"),
    currency: currencySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: assignableRoleSchema.default("MEMBER"),
});

export const updateMemberSchema = z.object({ role: assignableRoleSchema });

export const removeMemberSchema = z.object({});

export const invitationAcceptSchema = z.object({ token: idParam });

export const userSearchQuerySchema = z.object({
  q: optionalText(80),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const workspaceMembersQuerySchema = z.object({
  workspaceId: optionalId,
});

// ─── Клиенты, теги ─────────────────────────────────────────────────────────
export const clientCreateSchema = z.object({
  name: trimmed(2, 120, "Название клиента"),
  email: emailSchema.optional(),
  phone: optionalText(40),
  company: optionalText(120),
  industry: optionalText(80),
  website: optionalText(120),
  note: optionalText(2000),
});

/**
 * Список клиентов: `archived=1` переводит фильтр с «не в архиве» на «в архиве»,
 * третьего состояния нет — смешивать активных и архивных в одной таблице неудобно.
 */
export const clientListQuerySchema = z.object({
  q: optionalText(120),
  archived: z
    .union([z.literal("1"), z.literal("true"), z.literal("0"), z.literal("false")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export const clientUpdateSchema = clientCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Нечего обновлять",
);

const colorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Цвет — HEX, например #0ea5e9");

export const tagCreateSchema = z.object({
  name: trimmed(1, 40, "Название метки"),
  color: colorSchema.default("#64748b"),
});

export const tagUpdateSchema = z
  .object({ name: trimmed(1, 40, "Название метки"), color: colorSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

// ─── Чек-листы задачи ──────────────────────────────────────────────────────
export const checklistItemCreateSchema = z.object({
  title: trimmed(1, 200, "Название пункта"),
});

export const checklistItemUpdateSchema = z
  .object({
    title: trimmed(1, 200, "Название пункта"),
    done: z.boolean(),
    position: z.coerce.number().int().min(0).max(1000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

// ─── Проекты ───────────────────────────────────────────────────────────────
/**
 * Деньги проекта — копейки (Int в БД), форма пересчитывает рубли сама.
 * clientId обязателен: проект без клиента некому выставить счёт, и в
 * интерфейсе он превращается в сироту без карточки заказчика.
 */
const projectBase = z.object({
  name: trimmed(2, 120, "Название проекта"),
  clientId: idParam,
  description: optionalText(4000),
  status: projectStatusSchema,
  budget: z.coerce.number().int().min(0).max(1_000_000_000_00).optional(),
  hoursBudget: z.coerce.number().int().min(0).max(100_000).optional(),
  hourlyRate: z.coerce.number().int().min(0).max(100_000_00).optional(),
  dueDate: dateLike.optional(),
  billingType: z.enum(BILLING_TYPES),
  recurring: z.boolean(),
  recurrence: recurrenceIntervalSchema.optional(),
});

/**
 * Дефолты живут только в create-схеме. В zod `.partial()` сохраняет
 * `.default()`, поэтому patch-схема, унаследованная от create, молча
 * возвращала бы статус и тип биллинга к дефолтным значениям на каждой правке.
 */
export const projectCreateSchema = projectBase.extend({
  status: projectStatusSchema.default("ACTIVE"),
  billingType: z.enum(BILLING_TYPES).default("FIXED"),
  recurring: z.boolean().default(false),
});

export const projectUpdateSchema = projectBase
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

export const projectListQuerySchema = paginationWithSearchSchema.extend({
  status: projectStatusSchema.optional(),
  clientId: optionalId,
});

// ─── Задачи ────────────────────────────────────────────────────────────────
/**
 * Проект необязателен: задача может быть личной доски. Но если projectId есть,
 * он обязан быть непустой строкой — иначе задача «без проекта» с id "undefined"
 * оседает в базе мусором, который потом не найдёшь.
 */
/**
 * Задача живёт в воркспейсе; projectId пустой — это личная доска, не проект.
 * Оценок «billable/recurring» у задачи нет: оплачиваемость решает запись
 * времени, а повторяющиеся задачи заводит cron по проекту.
 */
export const taskCreateSchema = z.object({
  title: trimmed(2, 200, "Заголовок задачи"),
  projectId: optionalId,
  description: optionalText(4000),
  status: taskStatusSchema.default("TODO"),
  priority: taskPrioritySchema.default("MEDIUM"),
  assigneeId: optionalId,
  dueDate: dateLike.optional(),
  estimate: z.coerce.number().int().min(0).max(1000).optional(),
});

export const taskUpdateSchema = z
  .object({
    title: trimmed(2, 200, "Заголовок задачи"),
    description: optionalText(4000),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: optionalId,
    dueDate: dateLike.nullish(),
    estimate: z.coerce.number().int().min(0).max(1000).nullish(),
    position: numeric.optional(),
    projectId: optionalId.nullish(),
    /** Версия, с которой клиент взял задачу. Не совпадёт — правку отклоняем. */
    version: numeric.optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

export const taskListQuerySchema = paginationWithSearchSchema.extend({
  projectId: optionalId,
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  assigneeId: optionalId,
  /** Личная доска: только назначенные мне. */
  mine: z
    .union([z.literal("1"), z.literal("true")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
  /** Открытые задачи: без DONE и CANCELED. */
  open: z
    .union([z.literal("1"), z.literal("true")])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export const commentCreateSchema = z.object({
  body: trimmed(1, 4000, "Комментарий"),
});



// ─── Время и таймер ────────────────────────────────────────────────────────
/**
 * Запись о времени обязана к чему-то привязана: задача, проект или категория —
 * иначе она не попадёт ни в один отчёт и станет мусором.
 */
const timeTarget = (value: { projectId?: string; taskId?: string; categoryId?: string }) =>
  Boolean(value.projectId || value.taskId || value.categoryId);

export const timeEntryCreateSchema = z
  .object({
    projectId: optionalId,
    taskId: optionalId,
    categoryId: optionalId,
    description: optionalText(500),
    startedAt: dateLike.optional(),
    endedAt: dateLike.optional(),
    /** Для ручного ввода: минуты вместо пары начало/конец. */
    minutes: z.coerce.number().int().min(1).max(24 * 60).optional(),
    date: dateLike.optional(),
    billable: z.boolean().default(true),
  })
  .refine(timeTarget, "Нужна задача, проект или категория");

export const timeEntryUpdateSchema = z
  .object({
    projectId: optionalId,
    taskId: optionalId,
    categoryId: optionalId,
    description: optionalText(500),
    startedAt: dateLike,
    endedAt: dateLike.nullish(),
    date: dateLike,
    minutes: z.coerce.number().int().min(1).max(24 * 60),
    billable: z.boolean(),
    approved: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

export const timeEntryListQuerySchema = paginationSchema.extend({
  userId: optionalId,
  projectId: optionalId,
  taskId: optionalId,
  billable: booleanish.optional(),
  from: optionalText(40),
  to: optionalText(40),
});

export const timerStartSchema = z
  .object({
    projectId: optionalId,
    taskId: optionalId,
    categoryId: optionalId,
    description: optionalText(500),
    billable: z.boolean().default(true),
  })
  .refine(timeTarget, "Нужна задача, проект или категория");

// ─── Счета и платежи ───────────────────────────────────────────────────────
const invoiceItemSchema = z.object({
  id: optionalId,
  description: trimmed(1, 500, "Описание позиции"),
  quantity: z.coerce.number().min(0.01).max(10000).default(1),
  unitPrice: numeric.default(0),
});

/**
 * Суммы — в копейках (Int в БД). Дробые цены здесь недопустимы: 1/3 копейки
 * превращается в расхождение итога на рубль, а «сходимость» счёта — то, что
 * пользователь проверяет глазами в первую очередь.
 */
const invoiceBase = z.object({
  clientId: idParam,
  projectId: optionalId,
  currency: currencySchema,
  issueDate: dateLike.optional(),
  dueDate: dateLike.optional(),
  taxRate: z.coerce.number().min(0).max(100),
  notes: optionalText(2000),
  items: z.array(invoiceItemSchema).min(1, "Добавьте хотя бы одну позицию").max(200),
});

export const invoiceCreateSchema = invoiceBase.extend({
  currency: currencySchema.default("RUB"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
});

/**
 * Правка счёта: дефолты create здесь не действуют — иначе PATCH с одним
 * комментарием обнулил бы налог и вернул валюту по умолчанию.
 *
 * Статуса в схеме нет намеренно: DRAFT → SENT → PAID это переходы, у
 * которых есть побочные эффекты (письмо, отметка времени, статусы времени),
 * и живут они в маршрутах /send, /payments, /void. Принимать status здесь
 * означало бы молча выбрасывать то, что клиент просил.
 */
export const invoiceUpdateSchema = invoiceBase
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Нечего обновлять");

export const invoiceListQuerySchema = paginationWithSearchSchema.extend({
  status: invoiceStatusSchema.optional(),
  clientId: optionalId,
  projectId: optionalId,
  from: optionalText(40),
  to: optionalText(40),
});

export const paymentCreateSchema = z.object({
  amount: z.coerce.number().int().min(1, "Сумма должна быть больше нуля"),
  date: dateLike.optional(),
  method: z.enum(PAYMENT_METHODS).default("TRANSFER"),
  note: optionalText(500),
});

// ─── Дашборд, поиск, тарифы ────────────────────────────────────────────────
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

/**
 * Период по умолчанию — последние 30 дней: дашборд без периода показывал бы
 * всё за всю историю, и «выручка» смысла бы не имела.
 */
export const dashboardQuerySchema = z.object({
  from: dateLike.default(() => daysAgo(30)),
  to: dateLike.default(() => new Date()),
  projectIds: csvIds,
});

export const billingChangeSchema = z.object({
  plan: z.enum(["FREE", "STARTER", "TEAM"]),
});

export const billingIntervalSchema = z.enum(["monthly", "yearly"]);

export const idSchema = z.object({ id: idParam });

export { positiveInt };
