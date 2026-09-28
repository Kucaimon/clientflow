import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/auth/session";
import { requireActiveWorkspace } from "@/lib/workspace";

/**
 * Глобальный поиск по активному workspace.
 *
 * Запросы идут параллельно и режутся.take'ом: пользователю нужна первая десятка
 * по каждому типу, а не полный скан таблицы.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const workspaceId = await requireActiveWorkspace();
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) return ok({ query: q, clients: [], projects: [], tasks: [] });

    const contains = { contains: q, mode: "insensitive" as const };
    const take = 20;

    const [clients, projects, tasks] = await Promise.all([
      prisma.client.findMany({
        where: { workspaceId, name: contains },
        select: { id: true, name: true, company: true, archivedAt: true },
        orderBy: { name: "asc" },
        take,
      }),
      prisma.project.findMany({
        where: { workspaceId, OR: [{ name: contains }, { client: { name: contains } }] },
        select: {
          id: true,
          name: true,
          status: true,
          client: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
        take,
      }),
      prisma.task.findMany({
        where: {
          title: contains,
          OR: [{ project: { workspaceId } }, { project: null }],
        },
        select: {
          id: true,
          title: true,
          status: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take,
      }),
    ]);

    return ok({ query: q, clients, projects, tasks });
  } catch (error) {
    return handleApiError(error);
  }
}
