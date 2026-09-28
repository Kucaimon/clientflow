"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";
import { clientCreateSchema } from "@/lib/validation";

type ClientValues = z.infer<typeof clientCreateSchema>;

/**
 * Форма клиента.
 * Схема та же, что проверяет POST /api/clients, — сервер остаётся источником
 * истины, а клиентская проверка нужна только чтобы не гонять пустой запрос.
 */
export function ClientForm({
  onDone,
  submitLabel = "Создать клиента",
}: {
  onDone?: () => void;
  submitLabel?: string;
}) {
  const { request, pending } = useApi();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ClientValues>({
    resolver: zodResolver(clientCreateSchema as never),
    defaultValues: { name: "", industry: "", website: "", note: "" } as ClientValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await request("/api/clients", {
      method: "POST",
      body: values,
      successTitle: "Клиент создан",
    });

    if (result.ok) {
      onDone?.();
      return;
    }
    if (result.error?.code === "CONFLICT") {
      setError("name", { message: result.error.message ?? "Уже есть такой клиент" });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Название компании" htmlFor="name" error={errors.name?.message}>
        <input
          id="name"
          className="input"
          aria-invalid={Boolean(errors.name)}
          placeholder="Acme Inc."
          {...register("name")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Сфера" htmlFor="industry" error={errors.industry?.message}>
          <input id="industry" className="input" placeholder="E-commerce" {...register("industry")} />
        </Field>

        <Field label="Сайт" htmlFor="website" error={errors.website?.message}>
          <input
            id="website"
            className="input"
            inputMode="url"
            placeholder="https://acme.com"
            {...register("website")}
          />
        </Field>
      </div>

      <Field
        label="Заметка"
        htmlFor="note"
        error={errors.note?.message}
        hint="Контекст сотрудничества: только для команды"
      >
        <textarea id="note" rows={3} className="input resize-y" {...register("note")} />
      </Field>

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
