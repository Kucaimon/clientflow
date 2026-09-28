"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ClientForm } from "./client-form";
import { DialogContent } from "@/components/ui/dialog";

export function AddClientButton() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-primary h-9">
        <Plus className="size-4" aria-hidden />
        Добавить клиента
      </Dialog.Trigger>
      <DialogContent
        title="Новый клиент"
        description="Клиент нужен, чтобы завести проект: задачи создаются внутри проекта."
      >
        <ClientForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog.Root>
  );
}
