"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { profileUpdateSchema } from "@/lib/validation";

type Values = z.infer<typeof profileUpdateSchema>;

/** Имя и email. Email меняем вместе с проверкой уникальности на сервере. */
export function ProfileForm({ defaultValues }: { defaultValues: Values }) {
  const { request, pending } = useApi();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(profileUpdateSchema as never),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await request("/api/auth/me", {
      method: "PATCH",
      body: values,
      successTitle: "Профиль обновлён",
    });
    if (!result.ok && result.error?.code === "CONFLICT") {
      setError("email", { message: "Такой email уже занят" });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Имя" htmlFor="name" error={errors.name?.message} required>
          <input id="name" className="input" {...register("name")} />
        </Field>
        <Field
          label="Email"
          htmlFor="email"
          error={errors.email?.message}
          hint="Используется для входа и уведомлений"
          required
        >
          <input id="email" type="email" className="input" {...register("email")} />
        </Field>
      </div>
      <Button type="submit" disabled={pending || !isDirty}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
