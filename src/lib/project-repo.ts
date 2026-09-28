/**
 * Проекты: единая точка выборки с проверкой принадлежности воркспейсу.
 *
 * Фильтр `workspaceId` обязателен в каждом запросе: id проекта угадать
 * перебором сложно, но ссылки на него живут в почте, в истории браузера и в
 * логах прокси. Держать правило в двух функциях дешевле, чем в десяти роутах.
 */
import type { Prisma, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ProjectListQuery = {
  status?: string;
  clientId?: string;
  q?: string;
  page: number;
  perPage: number;
};

export async function getScopedProject<T extends Prisma.ProjectSelect>(
  id: string,
  workspaceId: string,
  select?: T,
) {
  return prisma.project.findFirst({
    where: { id, workspaceId },
    ...(select ? { select } : {}),
  });
}

/**
 * Проекты воркспейса с пагинацией.
 *
 * Архив из выдачи исключён: «архивный» проект — закрытая работа, и в списке
 * он только мешает. Статусы-фильтры при этом работают по ACTIVE/ON_HOLD/DONE.
 */
export async function listProjects(workspaceId: string, query: ProjectListQuery) {
  const where: Prisma.ProjectWhereInput = { workspaceId };

  if (query.status) {
    where.status = query.status as ProjectStatus;
  } else {
    where.status = { not: "ARCHIVED" };
  }
  if (query.clientId) where.clientId = query.clientId;
  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { description: { contains: query.q } },
      { client: { name: { contains: query.q } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        _count: { select: { tasks: true, invoices: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.perPage,
      take: query.perPage,
    }),
    prisma.project.count({ where }),
  ]);

  return { items, total, page: query.page, perPage: query.perPage };
}
