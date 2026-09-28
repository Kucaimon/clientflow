"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { changePasswordSchema } from "@/lib/validation";

type Values = z.infer<typeof changePasswordSchema>;

/**
 * Смена пароля.
 *
 * Текущий пароль спрашиваем обязательно: форма должна оставаться
 * неработоспособной для того, кто просто открыл чужой браузер.
 */
export function PasswordForm() {
  const { request, pending } = useApi();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(changePasswordSchema as never) });

  const onSubmit = handleSubmit(async (values) => {
    const result = await request("/api/auth/me", {
      method: "PUT",
      body: values,
      successTitle: "Пароль изменён",
    });
    if (!result.ok) {
      if (result.error?.code === "UNAUTHORIZED") {
        setError("currentPassword", { message: "Текущий пароль не подходит" });
      }
      return;
    }
    reset();
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Текущий пароль" htmlFor="currentPassword" error={errors.currentPassword?.message} required>
        <input id="currentPassword" type="password" className="input" autoComplete="current-password" {...register("currentPassword")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Новый пароль" htmlFor="newPassword" error={errors.newPassword?.message} hint="Минимум 8 символов" required>
          <input id="newPassword" type="password" className="input" autoComplete="new-password" {...register("newPassword")} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Меняем…" : "Сменить пароль"}
      </Button>
    </form>
  );
}
