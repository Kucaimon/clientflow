import { prisma } from "@/lib/prisma";
import { route } from "@/lib/api";
import { activeWorkspaceOrThrow } from "@/auth/workspace";

/**
 * Выгрузка воркспейса одним JSON.
 *
 * Дамп делается для человека, а не для машины: поля названы как в схеме,
 * но без passwordHash и служебных токенов — их перенос не имеет смысла,
 * а утечка в файле на рабочем столе стоила бы дорого.
 */
export const GET = route(async () => {
  const { workspace } = await activeWorkspaceOrThrow();
  const workspaceId = workspace.id;

  const [ws, clients, projects, tasks, timeEntries, invoices, labels] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, currency: true, plan: true, createdAt: true },
    }),
    prisma.client.findMany({ where: { workspaceId } }),
    prisma.project.findMany({ where: { workspaceId } }),
    prisma.task.findMany({
      where: { workspaceId },
      include: {
        comments: { select: { id: true, body: true, userId: true, createdAt: true } },
        checklistItems: { orderBy: { position: "asc" } },
      },
    }),
    prisma.timeEntry.findMany({ where: { workspaceId } }),
    prisma.invoice.findMany({
      where: { workspaceId },
      include: { items: { orderBy: { position: "asc" } }, payments: true },
    }),
    prisma.label.findMany({ where: { workspaceId } }),
  ]);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: ws,
    clients,
    projects,
    tasks,
    timeEntries,
    invoices,
    labels,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="clientflow-${stamp}.json"`,
      // Ответ зависит от активного воркспейса в куке — кэшировать нельзя.
      "cache-control": "no-store",
    },
  });
});
