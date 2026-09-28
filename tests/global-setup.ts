import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Отдельная база для тестов.
 * Тесты не должны писать в dev.db: иначе прогнанный набор затирает данные,
 * с которыми разработчик работает в браузере.
 */
const DB = fileURLToPath(new URL("../prisma/test.db", import.meta.url));

export default function setup() {
  rmSync(DB, { force: true });
  process.env.DATABASE_URL = "file:./test.db";
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--force-reset"], {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
