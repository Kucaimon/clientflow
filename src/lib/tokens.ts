/**
 * Хеш токена, а не сам токен: утечка таблицы не должна давать готовый доступ.
 * SHA-256 достаточно — токены случайные и полные, словарь к ним неприменим.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Buffer.from(digest).toString("hex");
}

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}
