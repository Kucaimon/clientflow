"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useApi } from "@/hooks/use-api";
import { workspaceUpdateSchema } from "@/lib/validation";
import { CURRENCY_LABEL } from "@/lib/format";

type Values = z.infer<typeof workspaceUpdateSchema>;

/**
 * Настройки воркспейса.
 *
 * Валюта — одна на воркспейс: счета в разных валютах внутри одной команды
 * потребовали бы курсов и пересчёта, а этого в продукте нет.
 */
export function WorkspaceForm({
  workspaceId,
  defaultValues,
}: {
  workspaceId: string;
  defaultValues: Values;
}) {
  const { request, pending } = useApi();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(workspaceUpdateSchema as never),
    defaultValues,
  });

  const onSubmit = handleSubmit((values) =>
    request(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: values,
      successTitle: "Воркспейс обновлён",
    }),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Название" htmlFor="ws-name" error={errors.name?.message} required>
          <input id="ws-name" className="input" {...register("name")} />
        </Field>
        <Field label="Валюта" htmlFor="ws-currency" error={errors.currency?.message}>
          <Select id="ws-currency" {...register("currency")}>
            {Object.entries(CURRENCY_LABEL).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" disabled={pending || !isDirty}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
