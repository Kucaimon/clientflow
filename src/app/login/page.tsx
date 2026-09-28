import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { getCurrentUser } from "@/auth/session";

export const metadata: Metadata = { title: "Вход" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/app/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Brand />
          {/* Двухстилевый заголовок референса: прямые слова + одно курсивное. */}
          <h1 className="mt-6 text-[32px] font-medium leading-[1.1] text-on-canvas">
            Клиенты, проекты и счета —{" "}
            <span className="font-cursive text-[40px] font-normal leading-none text-on-canvas">
              всё
            </span>{" "}
            в одном месте
          </h1>
          <p className="mt-2 text-sm text-on-canvas-muted">
            Вход в рабочее пространство агентства
          </p>
        </div>

        <div className="card p-5">
          <AuthForm mode="login" />
        </div>

        <p className="mt-4 text-center text-sm text-on-canvas-muted">
          Нет аккаунта?{" "}
          <Link href="/register" className="font-medium text-accent underline-offset-4 hover:underline">
            Создать
          </Link>
        </p>
      </div>
    </main>
  );
}
