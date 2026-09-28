"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";
import { projectCreateSchema } from "@/lib/validation";
import { PROJECT_STATUS } from "@/lib/status";

type Values = {
  name: string;
  clientId: string;
  description?: string;
  status: keyof typeof PROJECT_STATUS;
  budget?: number;
  dueDate?: string;
};

const STATUSES = Object.entries(PROJECT_STATUS) as [
  keyof typeof PROJECT_STATUS,
  { label: string },
][];

/**
 * Форма проекта.
 * Budget храним в строке формы как число или пусто: пустая строка — это «бюджет
 * не задан» (null), а не ноль. Конвертацию делает схема на сервере.
 */
export function ProjectForm({
  clients,
  onDone,
  submitLabel = "Создать проект",
}: {
  clients: { id: string; name: string }[];
  onDone?: () => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const { request, pending } = useApi();
  const [conflict, setConflict] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(projectCreateSchema as never),
    defaultValues: {
      name: "",
      description: "",
      status: "ACTIVE",
      budget: undefined,
      dueDate: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Бюджет в форме вводится в рублях, а хранится в копейках: дробные
    // деньги в Int — источник расхождений на рубль в итогах.
    const result = await request("/api/projects", {
      method: "POST",
      body: {
        ...values,
        budget: values.budget ? Math.round(values.budget * 100) : undefined,
      },
      successTitle: "Проект создан",
    });

    if (result.ok) {
      onDone?.();
      router.push("/app/projects");
      return;
    }
    setConflict(result.error?.message ?? null);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {clients.length === 0 ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Сначала добавьте клиента — проект всегда привязан к компании.
        </p>
      ) : null}

      <Field label="Название проекта" htmlFor="name" error={errors.name?.message}>
        <input
          id="name"
          className="input"
          aria-invalid={Boolean(errors.name)}
          placeholder="Редизайн интернет-магазина"
          {...register("name")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Клиент" htmlFor="clientId" error={errors.clientId?.message}>
          <select id="clientId" className="input" {...register("clientId")}>
            <option value="">Выберите клиента</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Этап" htmlFor="status" error={errors.status?.message}>
          <select id="status" className="input" {...register("status")}>
            {STATUSES.map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Бюджет" htmlFor="budget" error={errors.budget?.message}>
          <input
            id="budget"
            className="input tnum"
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            placeholder="12000"
            {...register("budget", {
              // Пустая строка в number-инпуте — «бюджет не задан», а не 0.
              setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)),
            })}
          />
        </Field>

        <Field label="Срок сдачи" htmlFor="dueDate" error={errors.dueDate?.message}>
          <input id="dueDate" className="input" type="date" {...register("dueDate")} />
        </Field>
      </div>

      <Field label="Описание" htmlFor="description" error={errors.description?.message}>
        <textarea
          id="description"
          rows={3}
          className="input resize-y"
          placeholder="Объём работ, ограничения, договорённости"
          {...register("description")}
        />
      </Field>

      {conflict ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {conflict}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || clients.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
