import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/auth/password";
import { cookieStore } from "./cookie-store";

/** Очистка идёт от «листовых» таблиц к родителю, иначе её прерывает внешний ключ. */
const DELEGATES = [
  "notification",
  "checklistItem",
  "taskComment",
  "taskLabelOnTask",
  "invoicePayment",
  "invoiceItem",
  "timeEntry",
  "activityLog",
  "invoice",
  "task",
  "projectMember",
  "project",
  "contact",
  "client",
  "label",
  "timeCategory",
  "invitation",
  "workspaceMember",
  "workspace",
  "session",
  "user",
] as const;

type Delegate = { deleteMany: (args: object) => Promise<unknown> };

/**
 * Сигнатура route-обработчика Next.
 */
export type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export async function resetDb() {
  for (const name of DELEGATES) {
    await (prisma as unknown as Record<string, Delegate>)[name].deleteMany({});
  }
  cookieStore.clear();
}

export type CreatedUser = {
  id: string;
  email: string;
  name: string;
  /** Роль в воркспейсе ниже, а не у пользователя. */
  role: string;
  password: string;
  workspaceId: string;
};

let counter = 0;

/**
 * Пользователь вместе с его воркспейсом и ролью в нём.
 *
 * Роль в продукте принадлежит членству, а не человеку: один и тот же
 * пользователь может быть владельцем одной команды и участником другой.
 * Поэтому «создать админа» здесь означает «создать владельца нового
 * воркспейса», а joinWorkspace добавляет человека в уже существующий.
 */
export async function createUser(
  role: string = "MEMBER",
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<CreatedUser> {
  const password = overrides.password ?? "super-secret-1";
  counter += 1;
  const email = overrides.email ?? `user${counter}@example.com`;
  const name = overrides.name ?? `Пользователь ${counter}`;

  const user = await prisma.user.create({
    data: { email, name, passwordHash: await hashPassword(password) },
    select: { id: true, email: true, name: true },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: `Воркспейс ${counter}`,
      members: { create: { userId: user.id, role } },
    },
    select: { id: true },
  });

  return { ...user, role, password, workspaceId: workspace.id };
}

/**
 * Второй человек в том же воркспейсе.
 *
 * Без этого нельзя проверить права: «рядовой не создаёт клиента» имеет
 * смысл только рядом с владельцем того же воркспейса.
 */
export async function joinWorkspace(
  workspaceId: string,
  role: string,
  overrides: Partial<{ email: string; name: string }> = {},
): Promise<CreatedUser> {
  counter += 1;
  const password = "super-secret-1";
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `member${counter}@example.com`,
      name: overrides.name ?? `Участник ${counter}`,
      passwordHash: await hashPassword(password),
    },
    select: { id: true, email: true, name: true },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId, userId: user.id, role },
  });

  return { ...user, role, password, workspaceId };
}

/** Токен сессии в обход HTTP-логина: тестам прав не нужен лишний round-trip. */
export async function sessionToken(userId: string): Promise<string> {
  const token = `token-${userId}`;
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

export function request(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
) {
  // В Next кука приходит с запросом; в тестах её кладём в то же хранилище,
  // которое подставлено вместо next/headers.
  if (init.token) cookieStore.set("cf_session", init.token);

  return new NextRequest(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(init.token ? { cookie: `cf_session=${init.token}` } : {}),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/**
 * Next-обработчик динамического маршрута принимает { params: Promise }.
 * Оборачиваем это здесь, чтобы в тестах не было шуршания про Promise.
 */
export function params(p: Record<string, string> = {}) {
  return { params: Promise.resolve(p) } as never;
}

export async function jsonOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export async function createClientViaApi(token: string, name: string) {
  const { POST } = await import("@/app/api/clients/route");
  const res = await POST(request("/api/clients", { method: "POST", token, body: { name } }), params({}));
  const body = await jsonOf<{ client?: { id: string } }>(res);
  if (res.status !== 201) throw new Error(`client create failed: ${res.status}`);
  return body.client!;
}

export async function createProjectViaApi(
  token: string,
  data: { name: string; clientId: string; managerId?: string | null; status?: string },
) {
  const { POST } = await import("@/app/api/projects/route");
  const res = await POST(request("/api/projects", { method: "POST", token, body: data }), params({}));
  const body = await jsonOf<{ project?: { id: string } }>(res);
  if (res.status !== 201) throw new Error(`project create failed: ${res.status} ${JSON.stringify(body)}`);
  return body.project!;
}

/** API отдаёт только id — воркспейс проекта тестам приходится доставать самому. */
export async function workspaceOfProject(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  return project.workspaceId;
}

export type CallResult<T> = { status: number; body: T; text: string; res: Response };

/**
 * Вызывает route-обработчик так же, как это делает Next: NextRequest + { params: Promise }.
 *
 * Модуль по умолчанию перезагружается: getCurrentUser обёрнут в React.cache,
 * а область этого кэша живёт столько, сколько живёт модуль. Без сброса второй тест
 * в процессе получил бы пользователя из первого.
 * fresh=false — сохранить модуль, когда тесту важно его внутреннее состояние
 * (бакеты rate-limit между попытками входа).
 */
export async function call<T = Record<string, unknown>>(
  specifier: string,
  exportName: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    fresh?: boolean;
  } = {},
): Promise<CallResult<T>> {
  if (init.fresh !== false) {
    const { vi } = await import("vitest");
    vi.resetModules();
  }
  const mod = (await import(specifier)) as Record<string, Handler>;
  const handler = mod[exportName];
  if (!handler) throw new Error(`${exportName} не экспортируется из ${specifier}`);

  // Метод берём из имени экспорта: GET-обработчик с телом — ошибка самого Request.
  // Тип контекста маршрута выводится из обработчика, поэтому здесь он общий.
  const res = await handler(
    request(path, { ...init, method: init.method ?? exportName }),
    { params: Promise.resolve(init.params ?? {}) } as never,
  );
  const text = await res.text();
  // Тело читаем один раз: Response нельзя прочитать повторно, поэтому наружу
  // отдаём и разобранный JSON, и исходный текст.
  let body: unknown = {};
  if (text) {
    body = text.trimStart().startsWith("{") || text.trimStart().startsWith("[") ? JSON.parse(text) : text;
  }
  return { status: res.status, body: body as T, text, res };
}
