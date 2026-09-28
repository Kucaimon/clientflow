"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/lib/status";
import type { Role } from "@/auth/workspace";

const MANAGEABLE: Role[] = ["VIEWER", "MEMBER", "MANAGER", "ADMIN"];

/**
 * Строка участника.
 *
 * Владелец и админ видят управление ролью, остальные — только имя: поле
 * должно отсутствовать, а не становиться disabled, чтобы не обещать
 * недоступное.
 */
export function MemberRow({
  workspaceId,
  memberId,
  name,
  email,
  role,
  isSelf,
  canManage,
}: {
  workspaceId: string;
  memberId: string;
  name: string;
  email: string;
  role: Role;
  isSelf: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function send(method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast({
          title: "Не получилось",
          description: payload.error?.message ?? `Ошибка ${res.status}`,
          variant: "error",
        });
        return;
      }
      toast({ title: method === "DELETE" ? "Участник удалён" : "Роль обновлена", variant: "success" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Владелец передаётся только вместе с повышением другого — удалять его нельзя.
  const locked = isSelf || role === "OWNER" || !canManage;
  void locked;

  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-semibold">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {name}
          {isSelf ? <span className="ml-1.5 text-xs text-ink-subtle">— это вы</span> : null}
        </p>
        <p className="truncate text-xs text-ink-subtle">{email}</p>
      </div>

      {canManage && !isSelf && role !== "OWNER" ? (
        <Select
          aria-label={`Роль: ${name}`}
          className="w-40"
          value={role}
          disabled={busy}
          onChange={(event) => send("PATCH", { role: event.target.value })}
        >
          {MANAGEABLE.map((option) => (
            <option key={option} value={option}>
              {ROLE_LABEL[option] ?? option}
            </option>
          ))}
        </Select>
      ) : (
        <span className="w-40 text-sm text-ink-subtle">{ROLE_LABEL[role] ?? role}</span>
      )}

      {canManage && !isSelf && role !== "OWNER" ? (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => send("DELETE")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          <span className="sr-only">Удалить {name}</span>
        </Button>
      ) : null}
    </div>
  );
}
