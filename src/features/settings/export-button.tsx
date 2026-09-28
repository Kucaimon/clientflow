"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Скачивание дампа.
 *
 * Обычной ссылкой не делаем: браузер не покажет ошибку сервера, а через
 * fetch мы читаем ответ и говорим, что пошло не так.
 */
export function ExportButton() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        toast({ title: "Экспорт не получился", description: `Ошибка ${res.status}`, variant: "error" });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "clientflow.json";
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: "Файл скачан", variant: "success" });
    } catch {
      toast({ title: "Нет связи с сервером", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
      Скачать JSON
    </Button>
  );
}
