import { describe, it, expect, beforeEach } from "vitest";
import { createUser, call, resetDb } from "./helpers";
import { cookieStore } from "./cookie-store";

const REGISTER = "@/app/api/auth/register/route";
const LOGIN = "@/app/api/auth/login/route";
const ME = "@/app/api/auth/me/route";
const LOGOUT = "@/app/api/auth/logout/route";

/** Роль существует только внутри воркспейса, поэтому она в блоке workspace. */
type RegisterBody = {
  user: { id: string; email: string };
  workspace: { id: string; name: string; role: string };
};
type MeBody = {
  user: { id: string; email: string; name: string } | null;
  workspace: { id: string; name: string; role: string } | null;
};

beforeEach(resetDb);

describe("регистрация", () => {
  it("создаёт аккаунт и открывает сессию", async () => {
    const { status, body } = await call<RegisterBody>(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Анна", email: "anna@example.com", password: "super-secret-1" },
    });

    expect(status).toBe(201);
    expect(body.workspace.role).toBe("OWNER");
    expect(cookieStore.has("cf_session")).toBe(true);
  });

  it("хранит пароль хешем, а не в открытом виде", async () => {
    await call(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Анна", email: "hash@example.com", password: "super-secret-1" },
    });

    const { prisma } = await import("@/lib/prisma");
    const stored = await prisma.user.findUnique({ where: { email: "hash@example.com" } });

    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toContain("super-secret-1");
    expect(stored?.passwordHash.startsWith("$2")).toBe(true);
  });

  it("каждый регистрирующийся получает свой воркспейс, а не чужой", async () => {
    const first = await call<RegisterBody>(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Владелец", email: "owner@example.com", password: "super-secret-1" },
    });
    const second = await call<RegisterBody>(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Сотрудник", email: "worker@example.com", password: "super-secret-1" },
    });

    // Владелец здесь — не глобальное звание, а роль в конкретном воркспейсе:
    // второй человек становится хозяином своей команды и ничьей больше.
    expect(first.body.workspace.role).toBe("OWNER");
    expect(second.body.workspace.role).toBe("OWNER");
    expect(second.body.workspace.id).not.toBe(first.body.workspace.id);

    const { prisma } = await import("@/lib/prisma");
    const memberships = await prisma.workspaceMember.findMany({
      where: { workspaceId: second.body.workspace.id },
    });
    expect(memberships).toHaveLength(1);
  });

  it("отклоняет попытку передать роль из тела запроса", async () => {
    const { status } = await call(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Гость", email: "guest@example.com", password: "super-secret-1", role: "OWNER" },
    });

    const { prisma } = await import("@/lib/prisma");
    expect(status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it("не принимает короткий пароль и битый JSON", async () => {
    const short = await call(REGISTER, "POST", "/api/auth/register", {
      body: { name: "Тест", email: "short@example.com", password: "123" },
    });
    const broken = await call(REGISTER, "POST", "/api/auth/register", { body: "{oops" });

    expect(short.status).toBe(400);
    expect(broken.status).toBe(400);
  });

  it("не создаёт дубль с тем же email", async () => {
    const payload = { name: "Тест", email: "dup@example.com", password: "super-secret-1" };
    await call(REGISTER, "POST", "/api/auth/register", { body: payload });
    const second = await call(REGISTER, "POST", "/api/auth/register", { body: payload });

    const { prisma } = await import("@/lib/prisma");
    expect(second.status).toBe(409);
    expect(await prisma.user.count()).toBe(1);
  });
});

describe("вход", () => {
  it("выдаёт сессию при верных данных", async () => {
    const user = await createUser("OWNER");

    const { status } = await call(LOGIN, "POST", "/api/auth/login", {
      body: { email: user.email, password: user.password },
    });

    expect(status).toBe(200);
    expect(cookieStore.has("cf_session")).toBe(true);
  });

  it("отвечает одинаково на несуществующий email и на неверный пароль", async () => {
    const user = await createUser();

    const wrongPassword = await call(LOGIN, "POST", "/api/auth/login", {
      body: { email: user.email, password: "wrong-password" },
    });
    const wrongEmail = await call(LOGIN, "POST", "/api/auth/login", {
      body: { email: "ghost@example.com", password: "wrong-password" },
    });

    // Идентичный ответ не даёт по эндпоинту собрать список зарегистрированных адресов.
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.status).toBe(401);
    expect(wrongEmail.text).toBe(wrongPassword.text);
  });

  it("блокирует перебор паролей", async () => {
    const user = await createUser();
    const body = { email: user.email, password: "wrong-password" };

    let status = 0;
    // Лимит — 10 попыток на окно; одиннадцатый запрос обязан получить 429.
    for (let i = 0; i < 11; i += 1) {
      status = (await call(LOGIN, "POST", "/api/auth/login", { body, fresh: false })).status;
    }

    expect(status).toBe(429);
  });
});

describe("сессия", () => {
  it("возвращает пользователя по куке и ничего не возвращает после выхода", async () => {
    const user = await createUser("ADMIN");
    await call(LOGIN, "POST", "/api/auth/login", {
      body: { email: user.email, password: user.password },
    });

    const authed = await call<MeBody>(ME, "GET", "/api/auth/me");
    // Роль возвращается вместе с активным воркспейсом, а не «вообще у человека».
    expect(authed.body.workspace?.role).toBe("ADMIN");

    await call(LOGOUT, "POST", "/api/auth/logout");
    const anon = await call<MeBody>(ME, "GET", "/api/auth/me");

    const { prisma } = await import("@/lib/prisma");
    expect(anon.body.user).toBeNull();
    // Сессию удаляем в БД, а не только на клиенте: украденный токен гаснем сразу.
    expect(await prisma.session.count()).toBe(0);
  });

  it("не принимает просроченную сессию и чистит её", async () => {
    const user = await createUser();
    const { prisma } = await import("@/lib/prisma");
    await prisma.session.create({
      data: { token: "expired-token", userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });

    const { body } = await call<MeBody>(ME, "GET", "/api/auth/me", {
      token: "expired-token",
    });

    expect(body.user).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });
});
