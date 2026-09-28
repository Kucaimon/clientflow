/**
 * Хранилище куки для тестов.
 * Висит на globalThis, а не на экспорте модуля: тесты сбрасывают граф модулей
 * (vi.resetModules), и ordinary module-level Map перестал бы совпадать с тем,
 * который видит мок next/headers.
 */
declare global {
  var __cfCookieStore: Map<string, string> | undefined;
}

export const cookieStore: Map<string, string> = (globalThis.__cfCookieStore ??= new Map());
