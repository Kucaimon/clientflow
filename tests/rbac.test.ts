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

const CLIENTS = "@/app/api/clients/route";
const CLIENT = "@/app/api/clients/[clientId]/route";
const TASKS = "@/app/api/tasks/route";
const TASK = "@/app/api/tasks/[id]/route";
const INVOICES = "@/app/api/invoices/route";

type Ids = { items: { id: string }[] };

beforeEach(resetDb);

/**
 * Воркспейс владельца с одним клиентом.
 *
 * workspaceId возвращается, чтобы тестам прав было кого в этот воркспейс
 * добавлять: роль существует только внутри членства, поэтому «менеджер»
 * из другого воркспейса — это про чужие данные, а не про права.
 */
async function fixture() {
  const owner = await createUser("OWNER");
  const ownerToken = await sessionToken(owner.id);
  const client = await createClientViaApi(ownerToken, "Рога и Копыта");
  return { owner, ownerToken, client, workspaceId: owner.workspaceId };
}

describe("права на создание клиентов", () => {
  it("рядовой сотрудник не создаёт клиента", async () => {
    const { workspaceId } = await fixture();
    const member = await joinWorkspace(workspaceId, "MEMBER");
    const memberToken = await sessionToken(member.id);

    const { status } = await call(CLIENTS, "POST", "/api/clients", {
      token: memberToken,
      body: { name: "Новый клиент" },
    });

    expect(status).toBe(403);
  });

  it("менеджер создаёт клиента", async () => {
    const manager = await createUser("MANAGER");
    const token = await sessionToken(manager.id);

    const { status } = await call(CLIENTS, "POST", "/api/clients", {
      token,
      body: { name: "Клиент от менеджера" },
    });

    expect(status).toBe(201);
  });

  it("без сессии запрос отклоняется", async () => {
    const { status } = await call(CLIENTS, "GET", "/api/clients");
    expect(status).toBe(401);
  });
});

describe("видимость данных", () => {
  it("исполнитель не видит чужих клиентов в списке", async () => {
    const { ownerToken, client } = await fixture();
    await createProjectViaApi(ownerToken, { name: "Сайт", clientId: client.id });

    const outsider = await createUser("MEMBER");
    const outsiderToken = await sessionToken(outsider.id);

    const { body } = await call<Ids>(CLIENTS, "GET", "/api/clients", { token: outsiderToken });
    expect(body.items).toHaveLength(0);
  });

  it("исполнитель видит клиента, если он назначен в задачу", async () => {
    const { owner, ownerToken, client, workspaceId } = await fixture();
    // Исполнитель обязан быть в той же команде: назначить человека из
    // чужого воркспейса приложение не даёт.
    const worker = await joinWorkspace(workspaceId, "MEMBER");
    const workerToken = await sessionToken(worker.id);

    const project = await createProjectViaApi(ownerToken, {
      name: "Лендинг",
      clientId: client.id,
      managerId: owner.id,
    });

    const task = await call<{ task: { id: string } }>(TASKS, "POST", "/api/tasks", {
      token: ownerToken,
      body: { projectId: project.id, title: "Сверстать экран", assigneeId: worker.id },
    });
    expect(task.status).toBe(201);

    const list = await call<Ids>(CLIENTS, "GET", "/api/clients", { token: workerToken });
    expect(list.body.items.map((i) => i.id)).toContain(client.id);

    const card = await call(CLIENT, "GET", `/api/clients/${client.id}`, {
      token: workerToken,
      params: { clientId: client.id },
    });
    expect(card.status).toBe(200);
  });

  it("исполнитель не может открыть карточку чужого клиента", async () => {
    const { client } = await fixture();
    const outsider = await createUser("MEMBER");
    const outsiderToken = await sessionToken(outsider.id);

    const { status } = await call(CLIENT, "GET", `/api/clients/${client.id}`, {
      token: outsiderToken,
      params: { clientId: client.id },
    });

    // Именно 404: 403 подтвердил бы существование клиента, и по кодам
    // ответов перебрали бы весь чужой воркспейс.
    expect(status).toBe(404);
  });

  it("чужую задачу нельзя перенести, подставив id", async () => {
    const { ownerToken, client } = await fixture();
    const project = await createProjectViaApi(ownerToken, { name: "Портал", clientId: client.id });
    const task = await call<{ task: { id: string } }>(TASKS, "POST", "/api/tasks", {
      token: ownerToken,
      body: { projectId: project.id, title: "Настроить CI" },
    });

    const outsider = await createUser("MEMBER");
    const outsiderToken = await sessionToken(outsider.id);

    // Перенос карточки — это PATCH (так делает канбан), POST-маршрута нет.
    const { status } = await call(TASK, "PATCH", `/api/tasks/${task.body.task.id}`, {
      token: outsiderToken,
      params: { id: task.body.task.id },
      body: { position: 5, status: "DONE" },
    });

    expect(status).toBe(404);
  });
});

describe("удаление", () => {
  it("менеджер не удаляет клиента", async () => {
    const { ownerToken, client, workspaceId } = await fixture();
    void ownerToken;
    const manager = await joinWorkspace(workspaceId, "MANAGER");
    const managerToken = await sessionToken(manager.id);

    const { status } = await call(CLIENT, "DELETE", `/api/clients/${client.id}`, {
      token: managerToken,
      params: { clientId: client.id },
    });

    expect(status).toBe(403);
  });

  it("владелец не удаляет клиента с проектами", async () => {
    const { ownerToken, client } = await fixture();
    await createProjectViaApi(ownerToken, { name: "Приложение", clientId: client.id });

    const { status, body } = await call<{ error: { message: string } }>(
      CLIENT,
      "DELETE",
      `/api/clients/${client.id}`,
      { token: ownerToken, params: { clientId: client.id } },
    );

    expect(status).toBe(409);
    expect(body.error.message).toContain("проекты");
  });

  it("счёт на PAID не удаляется", async () => {
    const { ownerToken, client } = await fixture();
    const invoice = await call<{ invoice: { id: string; status: string } }>(
      INVOICES,
      "POST",
      "/api/invoices",
      {
        token: ownerToken,
        body: {
          clientId: client.id,
          items: [{ description: "Поддержка, месяц", quantity: 1, unitPrice: 500000 }],
        },
      },
    );

    const INVOICE = "@/app/api/invoices/[id]/route";
    const SEND = "@/app/api/invoices/[id]/send/route";
    const PAYMENTS = "@/app/api/invoices/[id]/payments/route";
    const id = invoice.body.invoice.id;

    // Статус ставится переходами, а не полем: выставление и оплата.
    const sent = await call(SEND, "POST", `/api/invoices/${id}/send`, {
      token: ownerToken,
      params: { id },
    });
    expect(sent.status).toBe(200);

    const paid = await call(PAYMENTS, "POST", `/api/invoices/${id}/payments`, {
      token: ownerToken,
      params: { id },
      body: { amount: 500000, method: "TRANSFER" },
    });
    expect(paid.status).toBe(201);

    const del = await call(INVOICE, "DELETE", `/api/invoices/${id}`, {
      token: ownerToken,
      params: { id },
    });

    expect(del.status).toBe(409);
  });
});
