import { vi, beforeEach } from "vitest";
import { cookieStore } from "./cookie-store";

process.env.DATABASE_URL = "file:./test.db";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.SESSION_TTL_DAYS ??= "7";

/**
 * next/headers живёт только внутри Next-запроса, поэтому в тестах он подменён
 * хранилищем в памяти. Так проверяется поведение приложения, а не инфраструктура рантайма.
 */
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));

/**
 * revalidatePath существует только внутри Next-запроса: вызванный напрямую из
 * теста, он бросает «static generation store missing». Тесты вызывают
 * обработчики маршрутов минуя рантайм, поэтому кэш здесь — пустая операция:
 * проверяется поведение приложения, а не инвалидация.
 */
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

beforeEach(async () => {
  cookieStore.clear();
  // getCurrentUser обёрнут в React cache: вне запроса Next область кэша не сбрасывается,
  // поэтому модули перезагружаем и каждый тест стартует с чистого графа.
  vi.resetModules();
  const { resetRateLimits } = await import("@/lib/rate-limit");
  resetRateLimits();
});
