"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, UserPlus } from "lucide-react";
import { Field, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { inviteMemberSchema } from "@/lib/validation";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/auth/workspace";

type Values = { email: string; role: Role };

/**
 * Приглашение в команду.
 *
 * Письмо в демо не уходит, поэтому ссылку показываем прямо на экране —
 * админ может передать её руками. Токен живёт в ответе один раз: это
 * нормальный путь для демо, но не для продакшена.
 */
export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const { request, pending } = useApi();
  const toast = useToast();
  const [link, setLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(inviteMemberSchema as never),
    defaultValues: { email: "", role: "MEMBER" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await request(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: values,
    });
    if (!result.ok) return;

    const token = (result.data as { token?: string }).token;
    if (token) {
      setLink(`${window.location.origin}/invite/${token}`);
      reset();
    } else {
      toast({ title: "Человек уже в команде", variant: "success" });
    }
  });

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
        <Field label="Email" htmlFor="invite-email" error={errors.email?.message} className="min-w-56 flex-1" required>
          <input id="invite-email" type="email" className="input" placeholder="name@company.com" {...register("email")} />
        </Field>
        <Field label="Роль" htmlFor="invite-role" className="w-40">
          <Select id="invite-role" {...register("role")}>
            {(["MEMBER", "MANAGER", "ADMIN"] as Role[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role] ?? role}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          <UserPlus className="size-4" aria-hidden />
          Пригласить
        </Button>
      </form>

      {link ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface-muted px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-xs">{link}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast({ title: "Ссылка скопирована", variant: "success" });
            }}
          >
            <Copy className="size-3.5" aria-hidden />
            Скопировать
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-subtle">
          Приглашение действует 7 дней. Ссылку можно передать вручную — письмо в демо не отправляется.
        </p>
      )}
    </div>
  );
}
