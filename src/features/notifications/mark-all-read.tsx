"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/notifications", { method: "POST", body: "{}" });
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <CheckCheck className="size-4" aria-hidden />
      Прочитать все
    </Button>
  );
}
