/**
 * Скриншоты интерфейса через DevTools-протокол Chrome.
 *
 * Отдельный фреймворк не заводим: нужен один проход по страницам с
 * авторизованной кукой. Сессия берётся реальным запросом к /api/auth/login,
 * поэтому снимается то же состояние, что видит человек в браузере.
 *
 * Запуск: node scripts/screenshots.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = "http://localhost:3000";
const OUT = resolve("shots");
const EMAIL = "demo@clientflow.app";
const PASSWORD = "demo1234";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Логин: куку берём так же, как её получает браузер. */
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const raw = res.headers.getSetCookie?.().join("; ") ?? "";
  const token = /cf_session=([^;]+)/.exec(raw)?.[1];
  if (!token) throw new Error(`вход не удался: ${res.status}`);
  return token;
}

/** Реальные id: снимки должны показывать данные, а не пустые таблицы. */
async function sampleIds(token) {
  const get = async (path) =>
    (await fetch(`${BASE}${path}`, { headers: { cookie: `cf_session=${token}` } }).then((r) => r.json()));
  const clients = await get("/api/clients");
  const projects = await get("/api/projects");
  const invoices = await get("/api/invoices");
  return {
    client: clients.items?.[0]?.id,
    project: projects.items?.[0]?.id,
    invoice: invoices.items?.[0]?.id,
  };
}

/** Один WebSocket на весь прогон: ответы маршрутизируем по id. */
function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let next = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { done, fail } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? fail(new Error(message.error.message)) : done(message.result);
    }
  });
  return new Promise((resolveSocket, fail) => {
    socket.addEventListener("open", () =>
      resolveSocket({
        send(method, params = {}, sessionId) {
          const id = next++;
          socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((done, reject) => pending.set(id, { done, fail: reject }));
        },
        close: () => socket.close(),
      }),
    );
    socket.addEventListener("error", fail);
  });
}

async function devtoolsUrl() {
  for (let i = 0; i < 40; i++) {
    try {
      return (await (await fetch("http://127.0.0.1:9222/json/version")).json()).webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Chrome не поднялся на 9222");
}

const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9222", "--user-data-dir=/tmp/cf-chrome", "--no-first-run", "about:blank"],
  { stdio: "ignore" },
);

try {
  const token = await login();
  const ids = await sampleIds(token);
  const browser = await connect(await devtoolsUrl());

  const PAGES = [
    ["01-login", "/login", false],
    ["02-dashboard", "/app/dashboard", true],
    ["03-clients", "/app/clients", true],
    ["04-client", `/app/clients/${ids.client}`, true],
    ["05-project-kanban", `/app/projects/${ids.project}`, true],
    ["06-tasks", "/app/tasks", true],
    ["07-invoice", `/app/invoices/${ids.invoice}`, true],
    ["08-reports", "/app/reports", true],
    ["09-settings-team", "/app/settings/team", true],
    ["10-activity", "/app/activity", true],
  ];

  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  // Без enable домены Page/Network молчат: navigate и заголовки не применяются.
  await browser.send("Page.enable", {}, sessionId);
  await browser.send("Network.enable", {}, sessionId);
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 900, deviceScaleFactor: 2, mobile: false,
  }, sessionId);

  await mkdirSync(OUT, { recursive: true });
  for (const [name, path, authed] of PAGES) {
    // Куку передаём заголовком на каждый запрос: setCookie через CDP
    // терялся, и авторизованные страницы редиректились на вход.
    await browser.send("Network.setExtraHTTPHeaders", {
      headers: authed ? { Cookie: `cf_session=${token}` } : {},
    }, sessionId);
    await browser.send("Page.navigate", { url: `${BASE}${path}` }, sessionId);
    // Клиентские графики и канбан дорисовываются после гидрации.
    await sleep(2200);
    const shot = await browser.send("Page.captureScreenshot", { format: "png" }, sessionId);
    writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(shot.data, "base64"));
    console.log(`${name}.png`);
  }
  browser.close();
} finally {
  chrome.kill();
}
