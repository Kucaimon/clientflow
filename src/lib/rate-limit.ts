/**
 * Ограничитель частоты запросов в памяти процесса.
 *
 * Это не распределённый лимитер: на одном инстансе он честен, на нескольких
 * считает каждый сам. Для входа и регистрации этого достаточно, чтобы
 * перебор пароля перестал быть бесплатным, — а Redis ради демо не заводим.
 */
import { AppError, ErrorCodes } from "@/lib/errors";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/**
 * Бросает 429 с текстом, который форма показывает как есть.
 *
 * Ключ складывается из действия и источника (`login` + ip), чтобы лимит
 * входа не тратился на лимит регистрации тем же человеком.
 */
export function assertRateLimit(
  scope: string,
  key: string,
  limit: number,
  windowMs = 60_000,
  message = "Слишком много попыток, подождите минуту",
) {
  if (rateLimited(`${scope}:${key}`, limit, windowMs)) {
    throw new AppError(ErrorCodes.RATE_LIMITED, message);
  }
}

/** Только для тестов: состояние карты переживает тестовые кейсы. */
export function resetRateLimits() {
  buckets.clear();
}
