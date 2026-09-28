import { redirect } from "next/navigation";
import { requireUser } from "@/auth/session";
import { getActiveWorkspace } from "@/auth/workspace";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export type NotificationRow = {
  id: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/**
 * Оболочка рабочего пространства.
 * Данные профиля и уведомлений читаем здесь один раз: вложенные страницы
 * получают их через серверный рендер, а не повторяют запросы.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser().catch(() => redirect("/login"));
  const workspace = await getActiveWorkspace(user);

  // Схема хранит заголовок и подпись раздельно, а колокольцу нужен один текст.
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
  });

  const notifications: NotificationRow[] = rows.map((row) => ({
    id: row.id,
    message: row.body ? `${row.title} — ${row.body}` : row.title,
    link: row.href,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        user={user}
        workspace={
          workspace
            ? { name: workspace.name, role: workspace.role }
            : null
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar notifications={notifications} title="Рабочее пространство" />
        {/* Нижняя навигация на мобильном перекрывает контент — оставляем место. */}
        <main className="flex-1 px-4 pb-20 pt-5 md:px-6 md:pb-8">{children}</main>
      </div>
    </div>
  );
}
