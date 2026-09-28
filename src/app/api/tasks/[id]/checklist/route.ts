import { prisma } from "@/lib/prisma";
import { created, ok, readJson, route } from "@/lib/api";
import { AppError, ErrorCodes } from "@/lib/errors";
import { requireUser } from "@/auth/session";
import { activeWorkspaceOrThrow } from "@/auth/workspace";
import { checklistItemCreateSchema } from "@/lib/validation";

async function loadTask(id: string, workspaceId: string) {
  const task = await prisma.task.findFirst({ where: { id, workspaceId } });
  if (!task) throw new AppError(ErrorCodes.NOT_FOUND, "Задача не найдена");
  return task;
}

export const GET = route(async (_req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "VIEWER", user });
  const { id } = await params;
  const task = await loadTask(id, access.workspace.id);

  return ok(
    await prisma.checklistItem.findMany({
      where: { taskId: task.id },
      orderBy: { position: "asc" },
    }),
  );
});

export const POST = route(async (req, { params }) => {
  const user = await requireUser();
  const access = await activeWorkspaceOrThrow({ minRole: "MEMBER", user });
  const { id } = await params;
  const task = await loadTask(id, access.workspace.id);
  const body = await readJson(req, checklistItemCreateSchema);

  const last = await prisma.checklistItem.findFirst({
    where: { taskId: task.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const item = await prisma.checklistItem.create({
    data: {
      taskId: task.id,
      title: body.title,
      position: (last?.position ?? 0) + 1,
    },
  });

  return created(item);
});
