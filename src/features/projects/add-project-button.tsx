"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Plus } from "lucide-react";
import { ProjectForm } from "./project-form";
import { DialogContent } from "@/components/ui/dialog";

export function AddProjectButton({ clients }: { clients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-primary h-9">
        <Plus className="size-4" aria-hidden />
        Новый проект
      </Dialog.Trigger>
      <DialogContent title="Новый проект" description="Проект объединяет задачи, бюджет и счет">
        <ProjectForm clients={clients} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog.Root>
  );
}
