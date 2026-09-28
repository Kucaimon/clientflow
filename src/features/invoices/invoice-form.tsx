"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";
import { CURRENCIES } from "@/lib/format";


const formSchema = z.object({
  clientId: z.string().min(1, "Выберите клиента"),
  currency: z.string().min(3).max(3),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  taxRate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, "Опишите позицию"),
        quantity: z.string().min(1),
        unitPrice: z.string().min(1, "Ставка обязательна"),
      }),
    )
    .min(1, "Добавьте хотя бы одну позицию"),
});

type Values = z.infer<typeof formSchema>;
type Line = Values["items"][number];

const emptyLine = (): Line => ({ description: "", quantity: "1", unitPrice: "0" });

/** Сумма позиции в копейках: рубли из формы умножаем, дробей в базе нет. */
function lineTotal(line: Line): number {
  const quantity = Number(line.quantity) || 0;
  const price = Math.round((Number(line.unitPrice) || 0) * 100);
  return Math.round(quantity * price);
}

/**
 * Форма счёта.
 *
 * Итог считается на лету из позиций, но это только подсказка: настоящие
 * итоги пересчитывает сервер при сохранении. Расхождение между ними —
 * баг, и он виден прямо в форме.
 */
export function InvoiceForm({
  clients,
  defaultClientId,
  onDone,
}: {
  clients: { id: string; name: string }[];
  defaultClientId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { request, pending } = useApi();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Values>({
    // Форма работает со строками инпутов, серверная invoiceCreateSchema
    // проверяет уже числа и копейки — две разные модели, один источник правды.
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientId: defaultClientId ?? clients[0]?.id ?? "",
      currency: "RUB",
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      taxRate: "0",
      notes: "",
      items: [emptyLine()],
    },
  });

  const lines = useFieldArray({ control, name: "items" });
  const watched = watch(["items", "taxRate"]);
  const subtotal = (watched[0] ?? []).reduce((sum, line) => sum + lineTotal(line), 0);
  const total = Math.round(subtotal * (1 + (Number(watched[1]) || 0) / 100));

  const onSubmit = handleSubmit(async (values) => {
    const result = await request("/api/invoices", {
      method: "POST",
      body: {
        clientId: values.clientId,
        currency: values.currency,
        issueDate: values.issueDate || undefined,
        dueDate: values.dueDate || undefined,
        taxRate: Number(values.taxRate) || 0,
        notes: values.notes || undefined,
        items: values.items.map((line) => ({
          description: line.description,
          quantity: Number(line.quantity) || 1,
          unitPrice: Math.round((Number(line.unitPrice) || 0) * 100),
        })),
      },
    });

    if (result.ok) {
      onDone?.();
      router.push("/app/invoices");
      return;
    }
    setError(result.error?.message ?? null);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {clients.length === 0 ? (
        <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          Сначала добавьте клиента — счёт всегда выставляется на компанию.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Клиент" htmlFor="clientId" error={errors.clientId?.message}>
          <select id="clientId" className="input" {...register("clientId")}>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Валюта" htmlFor="currency" error={errors.currency?.message}>
          <select id="currency" className="input" {...register("currency")}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Дата" htmlFor="issueDate" error={errors.issueDate?.message}>
          <input id="issueDate" type="date" className="input" {...register("issueDate")} />
        </Field>
        <Field label="Оплатить до" htmlFor="dueDate" error={errors.dueDate?.message}>
          <input id="dueDate" type="date" className="input" {...register("dueDate")} />
        </Field>
        <Field label="Налог, %" htmlFor="taxRate" error={errors.taxRate?.message}>
          <input id="taxRate" type="number" min={0} max={100} className="input tnum" {...register("taxRate")} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Позиции</legend>
        {lines.fields.map((field, index) => {
          const line: Line | undefined = watch(`items.${index}` as const);
          return (
            <div key={field.id} className="flex flex-wrap items-start gap-2">
              <div className="min-w-[12rem] flex-1">
                <input
                  className="input"
                  placeholder="Что входит в счёт"
                  aria-label={`Описание позиции ${index + 1}`}
                  {...register(`items.${index}.description` as const)}
                />
                {errors.items?.[index]?.description?.message ? (
                  <p className="mt-1 text-xs text-danger">
                    {errors.items[index]?.description?.message}
                  </p>
                ) : null}
              </div>
              <input
                className="input tnum w-20"
                type="number"
                step="0.25"
                min="0"
                aria-label={`Количество, позиция ${index + 1}`}
                {...register(`items.${index}.quantity` as const)}
              />
              <input
                className="input tnum w-28"
                type="number"
                step="1"
                min="0"
                aria-label={`Ставка, позиция ${index + 1}`}
                {...register(`items.${index}.unitPrice` as const)}
              />
              <span className="tnum w-24 self-center text-right text-sm text-ink-muted">
                {((line ? lineTotal(line) : 0) / 100).toLocaleString("ru-RU")}
              </span>
              <button
                type="button"
                onClick={() => lines.remove(index)}
                disabled={lines.fields.length === 1}
                className="self-center text-ink-subtle hover:text-danger disabled:opacity-40"
                aria-label={`Удалить позицию ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          );
        })}

        <button type="button" onClick={() => lines.append(emptyLine())} className="btn btn-ghost h-8">
          <Plus className="size-4" aria-hidden />
          Позиция
        </button>
      </fieldset>

      <Field label="Комментарий к счету" htmlFor="notes" error={errors.notes?.message}>
        <textarea id="notes" rows={2} className="input resize-y" {...register("notes")} />
      </Field>

      <p className="tnum flex justify-between border-t border-line pt-3 text-sm">
        <span className="text-ink-muted">Итого к оплате</span>
        <span className="font-semibold">{(total / 100).toLocaleString("ru-RU")}</span>
      </p>

      {error ? (
        <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary" disabled={pending || clients.length === 0}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Создать черновик
        </button>
      </div>
    </form>
  );
}
