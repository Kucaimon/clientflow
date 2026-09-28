"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { loginSchema, registerSchema } from "@/lib/validation";

type Mode = "login" | "register";

type FormValues = { name: string; email: string; password: string };

/**
 * Схема одна на оба режима и импортируется с сервера: клиентская проверка
 * — удобство, настоящая — на /api/auth/*.
 */
// Тип параметра zodResolver выводим из самой функции: вручную повторять его —
// значит разойтись с ним при обновлении библиотеки.
type FormSchema = Parameters<typeof zodResolver>[0];

const SCHEMAS: Record<Mode, FormSchema> = {
  login: z.object({ email: loginSchema.shape.email, password: z.string().min(1, "Пароль обязателен") }),
  register: registerSchema,
};

/**
 * Общая форма входа и регистрации.
 * Валидация одна и та же на клиенте и на сервере (одна zod-схема из lib/validation):
 * расхождение формулировок между ними — классический источник «у меня не проходит».
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    // Форма одна на два режима, а схемы у них разные по составу полей:
    // резолвер приводим к типу формы, поля всё равно проверяет zod.
    resolver: zodResolver(SCHEMAS[mode]) as unknown as Resolver<FormValues, FormValues>,
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };

      if (!res.ok) {
        if (body.error?.code === "RATE_LIMITED") {
          setServerError(body.error.message ?? "Слишком много попыток");
        } else if (body.error?.message) {
          setServerError(body.error.message);
        } else {
          setServerError("Не удалось выполнить запрос");
        }
        return;
      }

      toast({
        title: mode === "login" ? "Вход выполнен" : "Аккаунт создан",
        variant: "success",
      });
      router.push("/app/dashboard");
      router.refresh();
    } catch {
      // Сеть могла отвалить запрос — сообщение обязательное, иначе форма «молчит».
      setServerError("Нет связи с сервером. Проверьте соединение");
      setError("root", { message: "network" });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "register" ? (
        <Field label="Имя" htmlFor="name" error={errors.name?.message}>
          <input
            id="name"
            className="input"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            placeholder="Анна Петрова"
            {...register("name")}
          />
        </Field>
      ) : null}

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          placeholder="you@studio.com"
          {...register("email")}
        />
      </Field>

      <Field
        label="Пароль"
        htmlFor="password"
        error={errors.password?.message}
        hint={mode === "register" ? "Минимум 8 символов" : undefined}
      >
        <input
          id="password"
          type="password"
          className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          aria-invalid={Boolean(errors.password)}
          {...register("password")}
        />
      </Field>

      {serverError ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {serverError}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {mode === "login" ? "Войти" : "Создать аккаунт"}
      </button>
    </form>
  );
}
