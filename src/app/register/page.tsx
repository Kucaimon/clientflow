import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { getCurrentUser } from "@/auth/session";

export const metadata: Metadata = { title: "Регистрация" };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/app/dashboard");

  const closed = process.env.ALLOW_SIGNUP === "false";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Brand />
          <h1 className="mt-6 text-[32px] font-medium leading-[1.1] text-on-canvas">
            Своя команда —{" "}
            <span className="font-cursive text-[40px] font-normal leading-none text-on-canvas">
              легко
            </span>
          </h1>
          <p className="mt-2 text-sm text-on-canvas-muted">
            Первый аккаунт получает права владельца рабочего пространства
          </p>
        </div>

        <div className="card p-5">
          {closed ? (
            <p className="text-sm text-ink-muted">
              Регистрация закрыта владельцем рабочего пространства.
            </p>
          ) : (
            <AuthForm mode="register" />
          )}
        </div>

        <p className="mt-4 text-center text-sm text-on-canvas-muted">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-accent underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  );
}
