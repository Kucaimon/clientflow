import { describe, it, expect, beforeEach } from "vitest";
import {
  call,
  createClientViaApi,
  createProjectViaApi,
  createUser,
  joinWorkspace,
  resetDb,
  sessionToken,
} from "./helpers";

const CRON = "@/app/api/cron/route";
const TASKS = "@/app/api/tasks/route";

const SECRET = process.env.CRON_SECRET ?? "";

async function overdueTask(dueDaysAgo = 2) {
  const owner = await createUser("OWNER");
  const token = await sessionToken(owner.id);
  const client = await createClientViaApi(token, "Клиент просрочки");
  // Исполнитель — участник того же воркспейса: назначить человека из чужой
  // команды приложение не даёт.
  const worker = await joinWorkspace(owner.workspaceId, "MEMBER");
  const workerToken = await sessionToken(worker.id);
  const project = await createProjectViaApi(token, { name: "Поддержка", clientId: client.id });

  const task = await call<{ task: { id: string } }>(TASKS, "POST", "/api/tasks", {
    token,
    body: { projectId: project.id, title: "Обновить сертификат", assigneeId: worker.id },
  });

  const { prisma } = await import("@/lib/prisma");
  await prisma.task.update({
    where: { id: task.body.task.id },
    data: { dueDate: new Date(Date.now() - dueDaysAgo * 86400_000) },
  });

  return { owner, token, worker, workerToken, project, task: task.body.task };
}

beforeEach(resetDb);

describe("cron просрочек", () => {
  it("не пускает без секрета", async () => {
    const { status } = await call(CRON, "GET", "/api/cron/tasks");
    expect(status).toBe(401);
  });

  it("не пускает с пустым секретом в конфигурации", async () => {
    const saved = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "";
    const { status } = await call(CRON, "GET", "/api/cron/tasks", {
      headers: { authorization: "Bearer " },
      fresh: false,
    });
    process.env.CRON_SECRET = saved;

    expect(status).toBe(401);
  });

  it("уведомляет исполнителя о просроченной задаче", async () => {
    const { worker } = await overdueTask();

    await call(CRON, "GET", "/api/cron/tasks", { headers: { authorization: `Bearer ${SECRET}` } });

    const { prisma } = await import("@/lib/prisma");
    const notifications = await prisma.notification.findMany({
      where: { userId: worker.id, type: "OVERDUE" },
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe("OVERDUE");
    expect(notifications[0].title).toContain("Обновить сертификат");
  });

  it("не дублирует уведомление при повторном запуске в тот же день", async () => {
    const { worker } = await overdueTask();

    // Ретрай вершера или ручной запуск не должны засыпать человека одинаковыми письмами.
    await call(CRON, "GET", "/api/cron/tasks", { headers: { authorization: `Bearer ${SECRET}` } });
    await call(CRON, "GET", "/api/cron/tasks", {
      headers: { authorization: `Bearer ${SECRET}` },
      fresh: false,
    });

    const { prisma } = await import("@/lib/prisma");
    expect(
      await prisma.notification.count({ where: { userId: worker.id, type: "OVERDUE" } }),
    ).toBe(1);
  });

  it("не трогает закрытые иfuture задачи", async () => {
    const { worker, task } = await overdueTask();
    const { prisma } = await import("@/lib/prisma");
    await prisma.task.update({ where: { id: task.id }, data: { status: "DONE" } });

    await call(CRON, "GET", "/api/cron/tasks", { headers: { authorization: `Bearer ${SECRET}` } });

    expect(
      await prisma.notification.count({ where: { userId: worker.id, type: "OVERDUE" } }),
    ).toBe(0);
  });

  it("чистит протухшие сессии", async () => {
    const { worker, token } = await overdueTask();
    void worker;
    const { prisma } = await import("@/lib/prisma");
    await prisma.session.create({
      data: {
        token: "old-session",
        userId: (await prisma.session.findFirstOrThrow({ where: { token } })).userId,
        expiresAt: new Date(Date.now() - 3 * 86400_000),
      },
    });

    const { body } = await call<{ sessionsPurged: number }>(CRON, "GET", "/api/cron/tasks", {
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(body.sessionsPurged).toBe(1);
    expect(await prisma.session.findUnique({ where: { token: "old-session" } })).toBeNull();
  });
});
