"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { useApi } from "@/hooks/use-api";
import { taskCreateSchema } from "@/lib/validation";
import { PRIORITY } from "@/lib/status";

type Values = { title: string; priority: string; dueDate?: string; assigneeId?: string };

/**
 * Быстрое добавление задачи прямо в колонку.
 *
 * Статус берётся из колонки, а не из формы: человек уже выбрал колонку,
 * когда нажимал «плюс», и спрашивать второй раз — плодить несогласованность.
 */
export function AddTaskButton({
  projectId,
  status,
  members,
}: {
  /** null — задача вне проекта: так выглядит личная доска «моё». */
  projectId: string | null;
  status: string;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { request, pending } = useApi();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(taskCreateSchema as never),
    defaultValues: { title: "", priority: "MEDIUM", dueDate: "", assigneeId: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await request("/api/tasks", {
      method: "POST",
      body: { ...values, projectId, status },
    });
    if (result.ok) {
      reset();
      setOpen(false);
      router.refresh();
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-ghost h-8 w-full justify-start px-2 text-xs text-ink-muted">
        <Plus className="size-3.5" aria-hidden />
        Задача
      </Dialog.Trigger>
      <DialogContent title="Новая задача" description="Появится в этой колонке.">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Что сделать" htmlFor="title" error={errors.title?.message}>
            <input
              id="title"
              className="input"
              autoFocus
              placeholder="Сверстать страницу корзины"
              aria-invalid={Boolean(errors.title)}
              {...register("title")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Приоритет" htmlFor="priority" error={errors.priority?.message}>
              <select id="priority" className="input" {...register("priority")}>
                {Object.entries(PRIORITY).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Срок" htmlFor="dueDate" error={errors.dueDate?.message}>
              <input id="dueDate" className="input" type="date" {...register("dueDate")} />
            </Field>
          </div>

          {members.length ? (
            <Field label="Исполнитель" htmlFor="assigneeId" error={errors.assigneeId?.message}>
              <select id="assigneeId" className="input" {...register("assigneeId")}>
                <option value="">Не назначен</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Создать
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog.Root>
  );
}
