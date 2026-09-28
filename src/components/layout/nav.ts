import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Users,
  BarChart3,
  Bell,
  History,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Обзор", icon: LayoutDashboard },
  { href: "/app/clients", label: "Клиенты", icon: Users },
  { href: "/app/projects", label: "Проекты", icon: FolderKanban },
  { href: "/app/tasks", label: "Задачи", icon: CheckSquare },
  { href: "/app/invoices", label: "Счета", icon: FileText },
  { href: "/app/reports", label: "Отчёты", icon: BarChart3 },
  { href: "/app/notifications", label: "Уведомления", icon: Bell },
  { href: "/app/activity", label: "История", icon: History },
];

/** Раздел считается активным по префиксу: /app/projects/123 подсвечивает «Проекты». */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
