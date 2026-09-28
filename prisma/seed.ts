/**
 * Демо-данные ClientFlow.
 *
 *   npm run db:seed
 *
 * Скрипт пересобирает данные с нуля: витрину должно быть воспроизводимо
 * получать на чистой базе. Деньги — копейки, как во всей схеме.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import type {
  InvoiceStatus,
  TaskPriority,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

const DAY = 86_400_000;

function dayAgo(days: number, hour = 10) {
  const date = new Date(Date.now() - days * DAY);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function dayAhead(days: number) {
  return dayAgo(-days);
}

async function main() {
  await prisma.taskLabelOnTask.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.label.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const workspace = await prisma.workspace.create({
    data: { name: "Северный ветер", plan: "TEAM", seats: 10, currency: "RUB" },
  });

  const hash = await bcrypt.hash("demo1234", 10);

  const anna = await prisma.user.create({
    data: { email: "demo@clientflow.app", name: "Анна Ковалёва", passwordHash: hash },
  });
  const mark = await prisma.user.create({
    data: { email: "mark@nordwind.studio", name: "Марк Тен", passwordHash: hash },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { workspaceId: workspace.id, userId: anna.id, role: "OWNER" },
      { workspaceId: workspace.id, userId: mark.id, role: "MEMBER" },
    ],
  });

  const clientsData = [
    {
      name: "Nordwind Logistics",
      email: "finance@nordwind.eu",
      company: "Nordwind Logistics GmbH",
      industry: "Логистика",
      website: "nordwind.eu",
      note: "Месячные инвойсы, отсрочка оплаты 30 дней.",
    },
    {
      name: "Baltic Grain Co.",
      email: "accounts@balticgrain.com",
      company: "Baltic Grain Co.",
      industry: "Агро",
      website: "balticgrain.com",
      note: "Счёт по этапам, нужен НДС Латвии.",
    },
    {
      name: "Kala & Fisk",
      email: "ink@kalafisk.se",
      company: "Kala & Fisk AB",
      industry: "Ритейл",
      website: "kalafisk.se",
      note: "Брендинг и сайт, платят быстро.",
    },
    {
      name: "Vilniaus Spaustuve",
      email: "apskaita@spausiuve.lt",
      company: "Vilniaus Spaustuve UAB",
      industry: "Полиграфия",
      website: "spausiuve.lt",
      note: "Печать и вёрстка, счёт с НДС.",
    },
  ];

  const clients: { id: string; name: string }[] = [];
  for (const data of clientsData) {
    clients.push(await prisma.client.create({ data: { workspaceId: workspace.id, ...data } }));
  }

  await prisma.contact.createMany({
    data: [
      { clientId: clients[0].id, name: "Уте Вольф", email: "u.wolf@nordwind.eu", position: "Финансы" },
      { clientId: clients[0].id, name: "Ян Келлер", email: "j.keller@nordwind.eu", position: "Операции" },
      { clientId: clients[1].id, name: "Лига Озола", email: "l.ozola@balticgrain.com", position: "Закупки" },
      { clientId: clients[2].id, name: "Эрик Даль", email: "eric@kalafisk.se", position: "Основатель" },
    ],
  });

  const labels = [];
  for (const data of [
    { name: "срочно", color: "#E5484D" },
    { name: "блокер", color: "#8E4EC6" },
    { name: "дизайн", color: "#0091FF" },
    { name: "счёт", color: "#30A46C" },
  ]) {
    labels.push(await prisma.label.create({ data: { workspaceId: workspace.id, ...data } }));
  }
  const labelByName = new Map(labels.map((label) => [label.name, label]));

  type SeedTask = [string, TaskStatus, TaskPriority, number, string];
  type SeedProject = {
    client: { id: string };
    name: string;
    description: string;
    status: ProjectStatus;
    budget: number;
    spent: number;
    hoursBudget: number;
    hourlyRate: number;
    dueDate: Date;
    billingType: "FIXED" | "HOURLY" | "RETAINER";
    manager: { id: string };
    tasks: SeedTask[];
  };

  const projectsData: SeedProject[] = [
    {
      client: clients[0],
      name: "Portal for Nordwind",
      description: "Логистический портал: роли, документы, трекинг грузов.",
      status: "ACTIVE",
      budget: 24_000_000,
      spent: 11_800_000,
      hoursBudget: 260,
      hourlyRate: 9_500_000,
      dueDate: dayAhead(45),
      billingType: "FIXED",
      manager: anna,
      tasks: [
        ["Схема ролей и доступов", "IN_PROGRESS", "HIGH", 16, "Доступы считаем от роли в воркспейсе"],
        ["Загрузка документов в карточку груза", "TODO", "MEDIUM", 24, "Лимит 25 МБ"],
        ["Трекинг: экран статуса", "IN_PROGRESS", "MEDIUM", 12, "Данные из API перевозчика"],
        ["История изменений груза", "DONE", "LOW", 8, ""],
        ["Уведомления по e-mail", "TODO", "LOW", 16, "Ждём макеты"],
        ["Импорт контрагентов из CSV", "IN_PROGRESS", "HIGH", 20, "Дубли по VAT — чистим"],
        ["Тесты авторизации", "TODO", "MEDIUM", 10, ""],
        ["Публикация на staging", "DONE", "MEDIUM", 4, ""],
      ],
    },
    {
      client: clients[1],
      name: "Warehouse Dashboard",
      description: "Панель склада: остатки, погрузки, KPI.",
      status: "ACTIVE",
      budget: 15_000_000,
      spent: 6_200_000,
      hoursBudget: 160,
      hourlyRate: 9_000_000,
      dueDate: dayAhead(20),
      billingType: "HOURLY",
      manager: mark,
      tasks: [
        ["KPI: оборачиваемость", "IN_PROGRESS", "HIGH", 14, "Формулу подтвердил клиент"],
        ["Таблица остатков и фильтры", "DONE", "MEDIUM", 10, ""],
        ["Экспорт в XLSX", "TODO", "MEDIUM", 6, ""],
        ["Мобильная версия", "REVIEW", "LOW", 18, "Ждём ответы по бэкенду"],
        ["График погрузок по дням", "TODO", "MEDIUM", 8, ""],
      ],
    },
    {
      client: clients[2],
      name: "Rebrand Kala & Fisk",
      description: "Айдентика, сайт, упаковка.",
      status: "ON_HOLD",
      budget: 9_000_000,
      spent: 8_750_000,
      hoursBudget: 90,
      hourlyRate: 10_000_000,
      dueDate: dayAgo(6),
      billingType: "FIXED",
      manager: anna,
      tasks: [
        ["Логотип: финальные файлы", "DONE", "HIGH", 12, ""],
        ["Гайд по цвету", "DONE", "MEDIUM", 8, ""],
        ["Сайт: главная и каталог", "IN_PROGRESS", "HIGH", 26, "Клиент задержал тексты"],
        ["Упаковка: макеты A4/A5", "BACKLOG", "LOW", 16, "Приостановлено клиентом"],
      ],
    },
    {
      client: clients[3],
      name: "Print Order System",
      description: "Приём заказов на печать, предоплата.",
      status: "ACTIVE",
      budget: 12_000_000,
      spent: 3_400_000,
      hoursBudget: 140,
      hourlyRate: 8_500_000,
      dueDate: dayAhead(70),
      billingType: "HOURLY",
      manager: mark,
      tasks: [
        ["Калькулятор тиража", "IN_PROGRESS", "HIGH", 20, "Плюс 20% к прайсу — согласовано"],
        ["Онлайн-оплата", "TODO", "HIGH", 24, ""],
        ["Статусы заказа", "TODO", "MEDIUM", 10, ""],
        ["Личный кабинет клиента", "BACKLOG", "LOW", 30, ""],
      ],
    },
    {
      client: clients[0],
      name: "Mobile Companion",
      description: "Мобильная версия портала для водителей.",
      status: "DONE",
      budget: 7_000_000,
      spent: 6_900_000,
      hoursBudget: 80,
      hourlyRate: 9_000_000,
      dueDate: dayAgo(70),
      billingType: "FIXED",
      manager: anna,
      tasks: [
        ["Онбординг водителя", "DONE", "HIGH", 12, ""],
        ["Оффлайн-режим", "DONE", "HIGH", 22, ""],
        ["Подпись получателя", "DONE", "MEDIUM", 8, ""],
      ],
    },
  ];

  const createdTasks: { id: string }[] = [];

  for (const data of projectsData) {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        clientId: data.client.id,
        name: data.name,
        description: data.description,
        status: data.status,
        budget: data.budget,
        spent: data.spent,
        hoursBudget: data.hoursBudget,
        hourlyRate: data.hourlyRate,
        dueDate: data.dueDate,
        billingType: data.billingType,
        managerId: data.manager.id,
      },
    });

    await prisma.projectMember.createMany({
      data: [
        { projectId: project.id, userId: anna.id, role: "OWNER" },
        { projectId: project.id, userId: mark.id, role: "MEMBER" },
      ],
    });

    let position = 1;
    for (const [title, status, priority, estimate, note] of data.tasks) {
      const assignee = position % 2 === 0 ? mark : anna;
      const task = await prisma.task.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          title,
          description: note || null,
          status,
          priority,
          position,
          estimate,
          dueDate: status === "DONE" ? null : dayAhead(position * 3),
          assigneeId: assignee.id,
          reporterId: data.manager.id,
        },
      });
      createdTasks.push(task);
      position += 1;
    }

    // Таймшиты: три недели работы по проекту, два человека.
    for (let index = 0; index < 15; index += 1) {
      const user = index % 3 === 0 ? mark : anna;
      await prisma.timeEntry.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          projectId: project.id,
          date: dayAgo(index * 2, 9 + (index % 6)),
          minutes: 60 + ((index * 37) % 210),
          billable: index % 4 !== 3,
          note: index % 5 === 0 ? "Созвон с клиентом" : null,
        },
      });
    }
  }

  // Комментарии — чтобы карточка задачи не была пустой.
  const first = createdTasks[0];
  if (first) {
    await prisma.taskComment.createMany({
      data: [
        { taskId: first.id, userId: anna.id, body: "Доступы берём из роли в воркспейсе, отдельной таблицы прав не заводим." },
        { taskId: first.id, userId: mark.id, body: "Тогда viewer не должен видеть финансовые поля — проверю на API." },
      ],
    });
  }

  const labelAssignments: [number, string][] = [[0, "срочно"], [5, "блокер"], [12, "дизайн"], [16, "счёт"]];
  for (const [index, name] of labelAssignments) {
    const task = createdTasks[index];
    const label = labelByName.get(name);
    if (!task || !label) continue;
    await prisma.taskLabelOnTask.create({
      data: { taskId: task.id, labelId: label.id, assignedBy: anna.id },
    });
  }

  // Задачи личной доски: без проекта, только мои.
  const personalTasks: [string, TaskStatus][] = [
    ["Разобрать входящие по Nordwind", "TODO"],
    ["Обновить договор с Baltic Grain", "IN_PROGRESS"],
    ["Собрать отчёт по часам за месяц", "DONE"],
  ];
  for (const [title, status] of personalTasks) {
    await prisma.task.create({
      data: {
        workspaceId: workspace.id,
        title,
        status,
        priority: "MEDIUM",
        assigneeId: anna.id,
        reporterId: anna.id,
      },
    });
  }

  type SeedInvoice = {
    client: { id: string };
    number: string;
    status: InvoiceStatus;
    items: [string, number, number][];
  };

  const invoicesData: SeedInvoice[] = [
    { client: clients[0], number: "2026-0001", status: "SENT", items: [["Абонемент на поддержку, январь", 1, 4_800_000]] },
    {
      client: clients[1],
      number: "2026-0002",
      status: "PAID",
      items: [["Этап 1: KPI-панель", 1, 45_000_000], ["Этап 2: таблица остатков", 1, 30_000_000]],
    },
    {
      client: clients[2],
      number: "2026-0003",
      status: "SENT",
      items: [["Айдентика", 1, 36_000_000], ["Сайт: главная страница", 1, 27_000_000]],
    },
    { client: clients[3], number: "2026-0004", status: "DRAFT", items: [["Калькулятор тиража", 8, 3_000_000]] },
  ];

  for (const data of invoicesData) {
    const subtotal = data.items.reduce((sum, item) => sum + item[1] * item[2], 0);

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId: workspace.id,
        clientId: data.client.id,
        number: data.number,
        status: data.status,
        currency: "RUB",
        issueDate: dayAgo(data.status === "DRAFT" ? 1 : 12),
        dueDate: dayAhead(data.status === "DRAFT" ? 20 : 18),
        subtotal,
        taxRate: 0,
        total: subtotal,
        notes: "Оплата по реквизитам счёта. НДС не облагается.",
      },
    });

    let position = 0;
    for (const [description, quantity, unitPrice] of data.items) {
      await prisma.invoiceItem.create({
        data: { invoiceId: invoice.id, description, quantity, unitPrice, position },
      });
      position += 1;
    }

    if (data.status === "PAID") {
      await prisma.invoicePayment.create({
        data: { invoiceId: invoice.id, amount: subtotal, date: dayAgo(4), method: "TRANSFER" },
      });
    }
  }

  await prisma.notification.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: anna.id,
        type: "TASK_ASSIGNED",
        title: "Вам назначена задача «Схема ролей и доступов»",
        href: "/tasks",
      },
      {
        workspaceId: workspace.id,
        userId: anna.id,
        type: "INVOICE_PAID",
        title: "Счёт 2026-0002 оплачен",
        body: "Baltic Grain Co., 75 000 ₽",
        href: "/invoices",
        readAt: dayAgo(1),
      },
      {
        workspaceId: workspace.id,
        userId: anna.id,
        type: "DUE_SOON",
        title: "Через три дня срок по «Импорт контрагентов из CSV»",
        href: "/tasks",
      },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      { workspaceId: workspace.id, userId: anna.id, type: "project.created", meta: JSON.stringify({ title: "Portal for Nordwind" }) },
      { workspaceId: workspace.id, userId: mark.id, type: "task.status_changed", meta: JSON.stringify({ title: "История изменений груза", from: "IN_PROGRESS", to: "DONE" }) },
      { workspaceId: workspace.id, userId: anna.id, type: "invoice.sent", meta: JSON.stringify({ title: "2026-0003" }) },
      { workspaceId: workspace.id, userId: mark.id, type: "time.created", meta: JSON.stringify({ title: "3 ч 20 мин — Warehouse Dashboard" }) },
    ],
  });

  console.log("Готово: воркспейс «" + workspace.name + "»");
  console.log("  вход: demo@clientflow.app / demo1234");
  console.log("  второй пользователь: mark@nordwind.studio / demo1234");
  console.log(
    "  " +
      (await prisma.client.count()) + " клиентов, " +
      (await prisma.project.count()) + " проектов, " +
      (await prisma.task.count()) + " задач, " +
      (await prisma.timeEntry.count()) + " записей времени, " +
      (await prisma.invoice.count()) + " счетов",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
