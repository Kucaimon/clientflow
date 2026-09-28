import { redirect } from "next/navigation";
import { getCurrentUser } from "@/auth/session";

/**
 * Маршрут "/", который невозможно прочитать: дальше по редиректу.
 * Публичного лендинга в этой версии нет — доступ к продукту по прямой ссылке.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/app/dashboard" : "/login");
}
