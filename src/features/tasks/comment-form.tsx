"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { useApi } from "@/hooks/use-api";

/** Комментарий к задаче. Отправка очищает поле только при успехе. */
export function CommentForm({ taskId }: { taskId: string }) {
  const [body, setBody] = useState("");
  const { request, pending } = useApi();
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text) return;
    const result = await request(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: { body: text },
    });
    if (result.ok) {
      setBody("");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="comment" className="sr-only">
        Комментарий
      </label>
      <textarea
        id="comment"
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        className="input resize-y"
        placeholder="Что-то уточнить по задаче…"
      />
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary h-9" disabled={pending || !body.trim()}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Отправить
        </button>
      </div>
    </form>
  );
}
