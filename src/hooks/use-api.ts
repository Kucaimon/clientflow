"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";

type ApiError = { error?: { code?: string; message?: string } };

/**
 * Единая обёртка над мутациями (POST/PATCH/DELETE).
 * Ответ сервера перечитываем после успеха: страница рендерится на сервере,
 * и без refresh() пользователь видел бы форму, но не результат.
 */
export function useApi() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const request = useCallback(
    async (
      url: string,
      options: {
        method: "POST" | "PUT" | "PATCH" | "DELETE";
        body?: unknown;
        successTitle?: string;
      },
    ) => {
      setPending(true);
      try {
        const res = await fetch(url, {
          method: options.method,
          headers: { "content-type": "application/json" },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });

        const text = await res.text();
        const payload = (text ? JSON.parse(text) : {}) as ApiError;

        if (!res.ok) {
          toast({
            title: "Не получилось",
            description: payload.error?.message ?? `Ошибка ${res.status}`,
            variant: "error",
          });
          return { ok: false as const, error: payload.error ?? null, status: res.status };
        }

        if (options.successTitle) {
          toast({ title: options.successTitle, variant: "success" });
        }
        router.refresh();
        return { ok: true as const, data: payload, status: res.status };
      } catch {
        toast({
          title: "Нет связи с сервером",
          description: "Изменения не сохранились",
          variant: "error",
        });
        return { ok: false as const, error: null, status: 0 };
      } finally {
        setPending(false);
      }
    },
    [router, toast],
  );

  return { request, pending };
}
