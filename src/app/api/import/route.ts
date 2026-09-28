import { z } from "zod";
import { revalidatePath } from "next/cache";
import { route, created, readJson } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { setActiveWorkspace } from "@/auth/workspace";
import { importWorkspace } from "@/lib/import";

/** Тело: сам дамп под ключом payload — файл человек скачал как есть. */
const importBodySchema = z.object({ payload: z.unknown() });

/**
 * Восстановление воркспейса из выгрузки.
 *
 * Файл приходит целиком в теле: это не потоковая загрузка, а перенос
 * небольшой выгрузки, и весь файл нужно проверить до первой записи.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const body = await readJson(req, importBodySchema);

  const result = await importWorkspace(body.payload, user.id);

  // Переключаем на импортированный воркспейс: человек зашёл именно за ним.
  await setActiveWorkspace(user.id, result.workspaceId);

  revalidatePath("/", "layout");
  return created(result);
});
