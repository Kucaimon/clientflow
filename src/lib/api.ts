import type { z } from "zod";
import { AppError, ErrorCodes, handleApiError } from "@/lib/errors";

export { AppError, ErrorCodes, handleApiError };

/**
 * Контекст dynamic route handler'а в Next 16: params — это Promise.
 *
 * Запрос принимаем как стандартный `Request`, а не как `NextRequest`:
 * обработчикам нужны только `.json()`, `.url` и `.headers`, а привязка к
 * типу Next ломает типизацию в каждом роуте, где аннотацию написали иначе.
 */
type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

/**
 * Оборачивает обработчик в единую обработку ошибок.
 * Без него непойманное исключение отдавало бы Next-овскую 500 со стеком.
 */
export function route<P extends Record<string, string> = Record<string, string>>(
  handler: (req: Request, ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: RouteContext<P>) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return handleApiError(err);
    }
  };
}

export const ok = (data: unknown, init?: ResponseInit) => Response.json(data, init);
export const created = (data: unknown) => Response.json(data, { status: 201 });
export const noContent = () => new Response(null, { status: 204 });

/**
 * JSON-тело по схеме.
 *
 * Битый JSON (а не только битые поля) превращаем в 400: запрос с обрезанным
 * телом не должен превращаться в 500.
 */
export async function readJson<T extends z.ZodType>(req: Request, schema: T) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Ожидается корректный JSON");
  }
  // .parse бросает ZodError, который handleApiError превращает в 400 со списком полей.
  return schema.parse(raw) as z.infer<T>;
}

/** Тот же readJson, но с историческим порядком аргументов: схема, затем запрос. */
export function parseBody<T extends z.ZodType>(schema: T, req: Request) {
  return readJson(req, schema);
}

/**
 * Query, валидированный схемой.
 *
 * Все значения из query — строки, и приведение (числа, булевы «1»/«true»)
 * живёт в схеме, а не в каждом роуте.
 */
export function readQuery<T extends z.ZodType>(schema: T, req: Request) {
  const obj: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((value, key) => {
    obj[key] = value;
  });
  return schema.parse(obj) as z.infer<T>;
}
