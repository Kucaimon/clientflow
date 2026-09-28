"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { DialogContent } from "@/components/ui/dialog";
import { InvoiceForm } from "./invoice-form";

/** Создание счёта. Всегда черновик — отправляем отдельным действием. */
export function CreateInvoiceButton({
  clients,
  defaultClientId,
}: {
  clients: { id: string; name: string }[];
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-primary h-9">
        <Plus className="size-4" aria-hidden />
        Новый счёт
      </Dialog.Trigger>
      <DialogContent title="Новый счёт" description="Появится как черновик — отправку подтверждаете отдельно.">
        <InvoiceForm clients={clients} defaultClientId={defaultClientId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog.Root>
  );
}
