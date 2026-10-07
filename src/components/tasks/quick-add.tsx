"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTaskAction } from "@/app/(app)/tasks/actions";
import { Input } from "@/components/ui/input";

export function QuickAdd(props: {
  projectId: string;
  parentId?: string;
  statusId?: string;
  placement?: "top" | "bottom";
  label: string;
  placeholder: string;
}) {
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (!value || pending) return;
    startTransition(async () => {
      const res = await createTaskAction({
        projectId: props.projectId,
        parentId: props.parentId,
        statusId: props.statusId,
        placement: props.placement,
        title: value,
      });
      if (!res.ok) {
        toast.error(res.error.fieldErrors?.title?.[0] ?? res.error.message);
        return;
      }
      setTitle("");
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2" data-quick-add>
      <Plus className="size-4 text-muted-foreground" aria-hidden />
      <Input
        aria-label={props.label}
        placeholder={props.placeholder}
        value={title}
        maxLength={200}
        readOnly={pending}
        onChange={(e) => setTitle(e.target.value)}
      />
    </form>
  );
}
