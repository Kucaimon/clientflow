import { describe, it, expect, beforeEach } from "vitest";
import {
  call,
  createClientViaApi,
  createProjectViaApi,
  createUser,
  joinWorkspace,
  resetDb,
  sessionToken,
  workspaceOfProject,
} from "./helpers";

const LIST = "@/app/api/invoices/route";
const ITEM = "@/app/api/invoices/[id]/route";
const SEND = "@/app/api/invoices/[id]/send/route";
const VOID = "@/app/api/invoices/[id]/void/route";
const PAYMENTS = "@/app/api/invoices/[id]/payments/route";

type InvoiceBody = {
  invoice: { id: string; number: string; status: string; total: number };
};

/** Позиция счёта: сумма считается из позиций, отдельного поля amount нет. */
const position = (unitPrice: number, quantity = 1) => ({
  description: "Работа по договору",
  quantity,
  unitPrice,
});

async function invoiceFixture() {
  const owner = await createUser("OWNER");
  const token = await sessionToken(owner.id);
  const client = await createClientViaApi(token, "Клиент счетов");
  const invoice = await call<InvoiceBody>(LIST, "POST", "/api/invoices", {
    token,
    body: { clientId: client.id, items: [position(1250000)] },
  });
  return { owner, token, client, invoice: invoice.body.invoice };
}

/** Воркспейс по токену сессии: права проверяются внутри одного воркспейса. */
async function workspaceOfToken(token: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const session = await prisma.session.findFirstOrThrow({ where: { token } });
  const membership = await prisma.workspaceMember.findFirstOrThrow({
    where: { userId: session.userId },
  });
  return membership.workspaceId;
}

beforeEach(resetDb);

describe("создание счёта", () => {
  it("выдаёт последовательный номер за текущий год", async () => {
    const { token, client } = await invoiceFixture();

    const second = await call<InvoiceBody>(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [position(100)] },
    });
    const third = await call<InvoiceBody>(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [position(200)] },
    });

    const year = new Date().getUTCFullYear();
    expect(second.body.invoice.number).toBe(`${year}-0002`);
    expect(third.body.invoice.number).toBe(`${year}-0003`);
  });

  it("считает итог из позиций, а не берёт его из запроса", async () => {
    const { token, client } = await invoiceFixture();

    const { body } = await call<InvoiceBody>(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [position(300000, 2), position(50000)], taxRate: 10 },
    });

    expect(body.invoice.total).toBe(715000);
  });

  it("не принимает дробную копейку", async () => {
    const { token, client } = await invoiceFixture();

    const { status } = await call(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [position(12.5)] },
    });

    expect(status).toBe(400);
  });

  it("не принимает счёт без позиций", async () => {
    const { token, client } = await invoiceFixture();

    const { status } = await call(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [] },
    });

    expect(status).toBe(400);
  });

  it("не привязывает счёт к проекту чужого клиента", async () => {
    const { token, client } = await invoiceFixture();
    const other = await createClientViaApi(token, "Другой клиент");
    const project = await createProjectViaApi(token, { name: "Чужой проект", clientId: other.id });
    void workspaceOfProject;

    const { status } = await call(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, projectId: project.id, items: [position(100)] },
    });

    expect(status).toBe(404);
  });
});

describe("жизненный цикл счёта", () => {
  it("проходит путь черновик → отправлен → оплачен", async () => {
    const { token, invoice } = await invoiceFixture();
    expect(invoice.status).toBe("DRAFT");

    const sent = await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });
    expect(sent.status).toBe(200);

    const paid = await call(PAYMENTS, "POST", "/x", {
      token,
      params: { id: invoice.id },
      body: { amount: 1250000, method: "TRANSFER" },
    });
    expect(paid.status).toBe(201);

    const after = await call<{ status: string }>(ITEM, "GET", "/x", { token, params: { id: invoice.id } });
    expect(after.body.status).toBe("PAID");
  });

  it("часть оплаты оставляет счёт частично оплаченным", async () => {
    const { token, invoice } = await invoiceFixture();
    await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });

    await call(PAYMENTS, "POST", "/x", {
      token,
      params: { id: invoice.id },
      body: { amount: 500000, method: "TRANSFER" },
    });

    const after = await call<{ status: string }>(ITEM, "GET", "/x", { token, params: { id: invoice.id } });
    expect(after.body.status).toBe("PARTIALLY_PAID");
  });

  it("не принимает оплату по черновику", async () => {
    const { token, invoice } = await invoiceFixture();

    const { status } = await call(PAYMENTS, "POST", "/x", {
      token,
      params: { id: invoice.id },
      body: { amount: 1250000, method: "TRANSFER" },
    });

    expect(status).toBe(409);
  });

  it("не принимает оплату больше остатка", async () => {
    const { token, invoice } = await invoiceFixture();
    await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });

    const { status } = await call(PAYMENTS, "POST", "/x", {
      token,
      params: { id: invoice.id },
      body: { amount: 9999999, method: "TRANSFER" },
    });

    expect(status).toBe(400);
  });

  it("не отправляет счёт повторно", async () => {
    const { token, invoice } = await invoiceFixture();
    await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });

    const { status } = await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });
    expect(status).toBe(409);
  });

  it("не отзывает уже отозванный счёт", async () => {
    const { token, invoice } = await invoiceFixture();
    await call(SEND, "POST", "/x", { token, params: { id: invoice.id } });

    const first = await call(VOID, "POST", "/x", { token, params: { id: invoice.id } });
    const second = await call(VOID, "POST", "/x", { token, params: { id: invoice.id } });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it("не меняет статус правкой: статус это переход, а не поле", async () => {
    const { token, invoice } = await invoiceFixture();

    const { status } = await call(ITEM, "PATCH", "/x", {
      token,
      params: { id: invoice.id },
      body: { status: "PAID" },
    });

    expect(status).toBe(400);
  });

  it("рядовой сотрудник не отправляет счёт", async () => {
    const { token, invoice } = await invoiceFixture();
    const member = await joinWorkspace(await workspaceOfToken(token), "MEMBER");
    const memberToken = await sessionToken(member.id);

    const { status } = await call(SEND, "POST", "/x", {
      token: memberToken,
      params: { id: invoice.id },
    });

    expect(status).toBe(403);
  });
});

describe("список счетов", () => {
  it("отдаёт страницу и общее количество", async () => {
    const { token, client } = await invoiceFixture();
    await call(LIST, "POST", "/api/invoices", {
      token,
      body: { clientId: client.id, items: [position(300000)] },
    });

    const { body } = await call<{ items: unknown[]; total: number }>(LIST, "GET", "/api/invoices", {
      token,
    });

    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("не отдаёт счета чужого воркспейса", async () => {
    const { token } = await invoiceFixture();
    void token;
    const outsider = await createUser("OWNER");
    const outsiderToken = await sessionToken(outsider.id);

    const { body } = await call<{ items: unknown[]; total: number }>(LIST, "GET", "/api/invoices", {
      token: outsiderToken,
    });

    expect(body.items).toHaveLength(0);
  });
});
