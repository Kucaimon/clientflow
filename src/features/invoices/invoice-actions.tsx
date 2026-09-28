"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Send, Trash2, XCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Действия по счету: отправить, отозвать, удалить черновик.
 *
 * Набор кнопок приходит со страницы и зависит от статуса на сервере. После
 * действия страница перезагружается — кнопки пересчитываются, а не остаются
 * от прошлого рендера.
 */
export function InvoiceActions({
  invoiceId,
  status,
  canAdmin,
}: {
  invoiceId: string;
  status: string;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  async function call(path: string, method: "POST" | "DELETE", success: string) {
    const res = await fetch(`/api/invoices/${invoiceId}${path}`, { method });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
      mail?: { sent: boolean; reason?: string };
    };

    if (!res.ok) {
      toast({
        title: "Не получилось",
        description: payload.error?.message ?? `Ошибка ${res.status}`,
        variant: "error",
      });
      return;
    }

    if (payload.mail && !payload.mail.sent) {
      toast({
        title: "Счёт отправлен, письмо нет",
        description: payload.mail.reason ?? "Почта не настроена",
        variant: "info",
      });
    } else {
      toast({ title: success, variant: "success" });
    }
    router.refresh();
  }

  const busy = pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? (
        <>
          <button
            type="button"
            className="btn btn-primary h-9"
            disabled={pending}
            onClick={() => start(() => call("", "POST", "Счёт отправлен"))}
          >
            {busy ?? <Send className="size-4" aria-hidden />}
            Отправить
          </button>
          {canAdmin ? (
            <ConfirmDialog
              trigger={
                <button type="button" className="btn btn-ghost h-9">
                  <Trash2 className="size-4" aria-hidden />
                  Удалить
                </button>
              }
              title="Удалить черновик?"
              description="Черновик исчезнет безвозвратно. Время, попавшее в него, освободится."
              confirmLabel="Удалить"
              destructive
              onConfirm={() => call("", "DELETE", "Черновик удалён")}
            />
          ) : null}
        </>
      ) : null}

      {canAdmin && (status === "SENT" || status === "PARTIALLY_PAID" || status === "OVERDUE") ? (
        <ConfirmDialog
          trigger={
            <button type="button" className="btn btn-ghost h-9">
              <XCircle className="size-4" aria-hidden />
              Отозвать
            </button>
          }
          title="Отозвать счёт?"
          description="Счёт останется в системе с номером, но перестанет учитываться. Время освободится для нового счёта."
          confirmLabel="Отозвать"
          destructive
          onConfirm={() => call("/void", "POST", "Счёт отозван")}
        />
      ) : null}
    </div>
  );
}
