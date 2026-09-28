import bcrypt from "bcryptjs";

/**
 * 12 раундов: ~250 мс наmodern CPU. Достаточно дорого для брутфорса и достаточно
 * быстро, чтобы не повесить воркер на логине. 72 символа — физический лимит bcrypt,
 * он проверен на схеме, поэтому здесь только константа стоимости.
 */
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
