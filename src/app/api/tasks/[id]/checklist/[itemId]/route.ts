import { prisma } from "@/lib/prisma";
import { noContent, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { checklistItemUpdateSchema } from "@/lib/validation";

/**
 * Пункт чек-листа меняется только через свою задачу: проверка идёт по цепочке
 * item → task → workspace, поэтому чужой itemId не сработает.
 */
async function loadItem(taskId: string, itemId: string, workspaceId: string) {
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, taskId, task: { workspaceId } },
  });
  if (!item) throw new AppError(ErrorCodes.NOT_FOUND, "Пункт не найден");
  return item;
}

export const PATCH = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id, itemId } = await params;
  const item = await loadItem(id, itemId, access.workspace.id);
  const body = await readJson(req, checklistItemUpdateSchema);

  return ok(
    await prisma.checklistItem.update({
      where: { id: item.id },
      data: { title: body.title, done: body.done, position: body.position },
    }),
  );
});

export const DELETE = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id, itemId } = await params;
  const item = await loadItem(id, itemId, access.workspace.id);

  await prisma.checklistItem.delete({ where: { id: item.id } });
  return noContent();
});
