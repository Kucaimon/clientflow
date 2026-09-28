/**
 * Единый язык ошибок для API и серверных действий.
 *
 * Клиент должен по любому 4xx понимать, что именно пошло не так: код ошибки
 * (для веток в UI) + сообщение (для тоста) + список полей (для формы). Поэтому
 * ошибка несёт код, а не только текст: тексты мы меняем, коды — нет.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  GONE: "GONE",
  RATE_LIMITED: "RATE_LIMITED",
  UNKNOWN: "UNKNOWN",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  RATE_LIMITED: 429,
  UNKNOWN: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Ошибка с явным HTTP-статусом — для мест, где код ошибки ничего не добавляет
 * («задача не найдена», «неверный секрет»). По смыслу это те же 4xx, просто
 * короче писать, чем AppError с подбором кода.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function unauthorized(message = "Нужен вход"): AppError {
  return new AppError(ErrorCodes.UNAUTHORIZED, message);
}

export function forbidden(message = "Недостаточно прав"): AppError {
  return new AppError(ErrorCodes.FORBIDDEN, message);
}

export function notFound(message = "Не найдено"): AppError {
  return new AppError(ErrorCodes.NOT_FOUND, message);
}

export function conflict(message: string): AppError {
  return new AppError(ErrorCodes.CONFLICT, message);
}

export function validationError(message: string, details?: unknown): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, message, details);
}

/** Тело ответа об ошибке: один формат на все 4xx/5xx. */
function body(code: ErrorCode, message: string, details?: unknown) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

/**
 * Превращает любое выброшенное исключение в ответ.
 *
 * Неизвестные ошибки не протекают наружу текстом: стек и сообщения Prisma —
 * это материал для логов, а не для пользователя.
 */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      body(error.code, error.message, error.details),
      { status: STATUS[error.code] },
    );
  }

  if (error instanceof ApiError) {
    const code = STATUS_CODE_BY_STATUS[error.status] ?? ErrorCodes.UNKNOWN;
    return NextResponse.json(body(code, error.message), { status: error.status });
  }

  if (error instanceof ZodError) {
    const fields = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return NextResponse.json(
      body(ErrorCodes.VALIDATION_ERROR, "Проверьте введённые данные", fields),
      { status: 400 },
    );
  }

  // Уникальность и «записи нет» приходят из Prisma: превращаем в понятные коды,
  // иначе гонка двух запросов отдаёт пользователю «Unknown error».
  const prisma = prismaErrorCode(error);
  if (prisma) {
    return NextResponse.json(body(prisma.code, prisma.message), { status: STATUS[prisma.code] });
  }

  console.error("[api]", error);
  return NextResponse.json(body(ErrorCodes.UNKNOWN, "Что-то пошло не так"), { status: 500 });
}

const STATUS_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCodes.VALIDATION_ERROR,
  401: ErrorCodes.UNAUTHORIZED,
  403: ErrorCodes.FORBIDDEN,
  404: ErrorCodes.NOT_FOUND,
  409: ErrorCodes.CONFLICT,
  429: ErrorCodes.RATE_LIMITED,
};

type PrismaLike = { code?: string; meta?: { target?: string[] | string; model?: string } };

function prismaErrorCode(error: unknown): { code: ErrorCode; message: string } | null {
  const err = error as PrismaLike & { name?: string };
  if (!err || typeof err.code !== "string") return null;

  if (err.code === "P2002") {
    const target = err.meta?.target;
    const field = Array.isArray(target) ? target.join(", ") : (target ?? "значение");
    return { code: ErrorCodes.CONFLICT, message: `Такое ${field} уже есть` };
  }

  if (err.code === "P2025") {
    return { code: ErrorCodes.NOT_FOUND, message: "Запись уже удалена" };
  }

  if (err.code === "P2003") {
    return { code: ErrorCodes.CONFLICT, message: "Связанная запись всё ещё используется" };
  }

  return null;
}
