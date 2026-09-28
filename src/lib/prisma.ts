import { PrismaClient } from "@prisma/client";

// Единственный экземпляр PrismaClient на процесс.
// В dev Next.js перечитывает модули при каждой горячем релоаде, поэтому кэшируем
// клиент через globalThis — иначе открываются сотни соединений и пул "захлёбывается".
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Кэшируем и в production: при перезагрузке модулей (тесты, HIT) это единственный
// способ не открыть по новому клиенту на каждую импорт-сессию.
globalForPrisma.prisma = prisma;
