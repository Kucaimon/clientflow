import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError, handleApiError, ok } from "@/lib/api";
import { daysOverdue, findOverdueTasks, findRecurringToGenerate } from "@/lib/cron";
import { logActivity } from "@/lib/audit";

/**
 * Точка входа для внешнего планировщика (Vercel Cron, GitHub Actions).
 *
 * Секрет обязателен, если CRON_SECRET задан: без него эндпоинт превращается
 * в публичную кнопку «разослать письма всем».
 */
/**
 * Ключ планировщика.
 *
 * Пустой CRON_SECRET не открывает эндпоинт: без настроенного ключа он
 * обязан отказывать, иначе забытая конфигурация превращается в публичную
 * кнопку «разослать письма всем».
 *
 * Ответ — 401, а не 403: у вызывающего нет валидных креденшелов, а не
 * «доступ запрещён» к разрешённому ресурсу.
 */
function assertAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new AppError("UNAUTHORIZED", "CRON_SECRET не настроен, планировщик отключён");
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ")
    ? header.slice(7)
    : new URL(req.url).searchParams.get("secret");
  if (!provided) {
    throw new AppError("UNAUTHORIZED", "Требуется ключ планировщика");
  }

  // Сравнение по хешам одинаковой длины: timingSafeEqual падает на разной
  // длине, а сравнивать строки посимвольно — значит светить длину ключа.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  if (!timingSafeEqual(a, b)) {
    throw new AppError("UNAUTHORIZED", "Ключ планировщика не подошёл");
  }
}

const DAY = 86_400_000;

function nextRun(from: Date, recurrence: string | null): Date {
  const weeks = recurrence === "WEEKLY" ? 1 : recurrence === "BIWEEKLY" ? 2 : 0;
  if (weeks) return new Date(from.getTime() + weeks * 7 * DAY);
  if (recurrence === "QUARTERLY") return new Date(from.setMonth(from.getMonth() + 3));
  return new Date(from.setMonth(from.getMonth() + 1));
}

/**
 * Два дела, которые должны happen сами: письма о просрочке и заведение
 * повторяющихся задач. Оба идемпотентны — повторный запуск ничего не
 * дублирует, потому что отмечаем обработанные строки в базе.
 */
export async function POST(req: Request) {
  try {
    assertAuthorized(req);

    const overdue = await findOverdueTasks();
    const notifications = await prisma.notification.createMany({
      data: overdue.flatMap((task) => {
        // Задача личной доски ни к проекту не привязана, ни к ведущему —
        // напоминать про неё некому и некуда вести ссылку.
        const project = task.project;
        if (!project) return [];
        const days = daysOverdue(task.dueDate as Date);
        const recipients = [task.assigneeId, project.managerId].filter(
          (id): id is string => Boolean(id),
        );
        return [...new Set(recipients)].map((userId) => ({
          workspaceId: project.workspaceId,
          userId,
          type: "OVERDUE" as const,
          title: `Просрочена задача «${task.title}» (${days} дн.)`,
          href: `/app/projects/${project.id}`,
          entityId: task.id,
        }));
      }),
    });

    // Отметку ставим после писем: если письмо не ушло, задача напомнит о себе завтра.
    await prisma.task.updateMany({
      where: { id: { in: overdue.map((task) => task.id) } },
      data: { overdueNotifiedAt: new Date() },
    });

    const recurring = await findRecurringToGenerate();
    let created = 0;
    for (const project of recurring) {
      const occurrence = project.occurrence + 1;
      await prisma.task.create({
        data: {
          workspaceId: project.workspaceId,
          projectId: project.id,
          title: `${project.name} — ${occurrence}-й период`,
          status: "TODO",
          estimate: project.estimate,
          assigneeId: project.managerId,
          reporterId: project.managerId,
        },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: {
          occurrence,
          nextRunAt: nextRun(project.nextRunAt as Date, project.recurrence),
          lastGenTitle: project.name,
        },
      });
      await logActivity(prisma, {
        workspaceId: project.workspaceId,
        entityId: project.id,
        type: "task.created",
        meta: { title: `${project.name} #${occurrence}`, recurring: true },
      });
      created += 1;
    }

    // Сессии с истёкшим сроком всё равно никогда не используются, а строки
    // копятся: чистим их здесь, отдельного задания для этого не заводим.
    const purged = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    return ok({
      overdue: notifications.count,
      recurring: created,
      sessionsPurged: purged.count,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** GET — чтобы планировщик на Vercel ходил обычным запросом. */
export const GET = POST;
