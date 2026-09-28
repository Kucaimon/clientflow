import { describe, it, expect, beforeEach } from "vitest";
import {
  call,
  createClientViaApi,
  createProjectViaApi,
  createUser,
  resetDb,
  sessionToken,
  workspaceOfProject,
} from "./helpers";

const TASKS = "@/app/api/tasks/route";
const TASK = "@/app/api/tasks/[id]/route";

type TaskBody = { task: { id: string; title: string; status: string; version: number; position: number } };

async function board() {
  const owner = await createUser("OWNER");
  const token = await sessionToken(owner.id);
  const client = await createClientViaApi(token, "Клиент доски");
  const project = await createProjectViaApi(token, { name: "Портал", clientId: client.id });
  return { owner, token, client, project };
}

beforeEach(resetDb);

describe("Kanban-доска", () => {
  it("создаёт задачу в конце колонки", async () => {
    const { token, project } = await board();

    const first = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Первая" },
    });
    const second = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Вторая" },
    });

    expect(second.body.task.position).toBeGreaterThan(first.body.task.position);
  });

  it("список ограничен воркспейсом: без projectId чужие задачи не видны", async () => {
    const { token, project } = await board();
    await call(TASKS, "POST", "/api/tasks", { token, body: { projectId: project.id, title: "Первая карточка" } });

    const list = await call<{ items: unknown[]; total: number }>(
      TASKS,
      "GET",
      `/api/tasks?projectId=${project.id}`,
      { token },
    );
    expect(list.body.items).toHaveLength(1);

    // Список без projectId легален — это личная доска, но границы воркспейса
    // он обязан соблюдать: чужая команда не должна «просвечивать» через фильтр.
    const outsider = await createUser("OWNER");
    const outsiderToken = await sessionToken(outsider.id);
    const foreign = await call<{ items: unknown[] }>(TASKS, "GET", "/api/tasks", {
      token: outsiderToken,
    });
    expect(foreign.body.items).toHaveLength(0);
  });

  it("перенос задачи меняет колонку и позицию", async () => {
    const { token, project } = await board();
    const task = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Рефакторинг" },
    });

    // Перенос карточки — PATCH (так делает канбан), ответа-обёртки нет.
    const moved = await call<TaskBody["task"]>(TASK, "PATCH", "/x", {
      token,
      params: { id: task.body.task.id },
      body: { status: "IN_PROGRESS", position: 3 },
    });

    expect(moved.body.status).toBe("IN_PROGRESS");
    expect(moved.body.position).toBe(3);
  });
});

describe("оптимистичная блокировка", () => {
  it("второе сохранение с устаревшей версией отклоняется", async () => {
    const { token, project } = await board();
    const { body } = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Общая карточка" },
    });
    const id = body.task.id;
    const version = body.task.version;

    const firstSave = await call<TaskBody["task"]>(TASK, "PATCH", "/x", {
      token,
      params: { id },
      body: { title: "Переименовал первый", version },
    });
    expect(firstSave.status).toBe(200);
    expect(firstSave.body.version).toBe(version + 1);

    // Второй клиент держит ту же версию — его правка не должна затереть первую.
    const staleSave = await call<{ error?: { code: string } }>(TASK, "PATCH", "/x", {
      token,
      params: { id },
      body: { title: "Переименовал второй", version },
    });

    expect(staleSave.status).toBe(409);
    expect(staleSave.body.error?.code).toBe("CONFLICT");

    const { prisma } = await import("@/lib/prisma");
    const stored = await prisma.task.findUnique({ where: { id } });
    expect(stored?.title).toBe("Переименовал первый");
  });

  it("параллельные перетаскивания не теряют карточку", async () => {
    const { token, project } = await board();
    const { body } = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Гонка" },
    });
    const id = body.task.id;

    const results = await Promise.all([
      call(TASK, "PATCH", "/x", { token, params: { id }, body: { position: 1 } }),
      call(TASK, "PATCH", "/x", { token, params: { id }, body: { position: 2 } }),
    ]);

    const { prisma } = await import("@/lib/prisma");
    const stored = await prisma.task.findUnique({ where: { id } });

    // Задача без version в запросе выполняется всегда: drag-and-drop не должен
    // отваливаться на каждой гонке, но карточка обязана остаться одна.
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
    // Версия растёт с каждой правкой: 1 при создании + два перетаскивания.
    expect(stored?.version).toBe(3);
  });
});

describe("удаление задачи", () => {
  it("задачу с учтённым временем удалить нельзя", async () => {
    const { token, project } = await board();
    const { body } = await call<TaskBody>(TASKS, "POST", "/api/tasks", {
      token,
      body: { projectId: project.id, title: "Аудит" },
    });

    const { prisma } = await import("@/lib/prisma");
    await prisma.timeEntry.create({
      data: {
        workspaceId: await workspaceOfProject(project.id),
        projectId: project.id,
        taskId: body.task.id,
        userId: (await prisma.session.findFirstOrThrow({ where: { token } })).userId,
        date: new Date(),
        minutes: 90,
      },
    });

    const { status } = await call(TASK, "DELETE", "/x", { token, params: { id: body.task.id } });
    expect(status).toBe(409);
  });
});
