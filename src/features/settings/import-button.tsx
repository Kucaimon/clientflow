"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Result = {
  name: string;
  counts: Record<string, number>;
  warnings: string[];
};

/**
 * Загрузка выгрузки.
 *
 * Файл читается на клиенте и отправляется как JSON: отдельный endpoint под
 * upload не нужен, а ошибку «это не JSON» видно до запроса.
 */
export function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        toast({ title: "Файл не читается", description: "Ожидается JSON из выгрузки", variant: "error" });
        return;
      }

      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const body = (await res.json()) as Result & { error?: { message?: string } };

      if (!res.ok) {
        toast({
          title: "Импорт не выполнен",
          description: body.error?.message ?? `Ошибка ${res.status}`,
          variant: "error",
        });
        return;
      }

      toast({
        title: `Воркспейс «${body.name}» создан`,
        description:
          body.warnings.length > 0
            ? `С предупреждениями: ${body.warnings[0]}`
            : `Клиентов ${body.counts.clients}, задач ${body.counts.tasks}`,
        variant: "success",
      });
      // Активный воркспейс сменился на сервере — перечитываем оболочку.
      router.refresh();
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Файл выгрузки"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        Загрузить JSON
      </Button>
    </>
  );
}
