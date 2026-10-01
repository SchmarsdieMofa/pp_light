"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type FieldErrors = Record<string, string[] | undefined>;

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await createProjectAction({
        name: String(form.get("name") ?? ""),
        key: String(form.get("key") ?? ""),
        description: String(form.get("description") ?? ""),
      });
      if (!res.ok) {
        if (res.error.fieldErrors) setErrors(res.error.fieldErrors);
        else if (res.error.code === "KEY_TAKEN") setErrors({ key: [res.error.message] });
        else toast.error(res.error.message);
        return;
      }
      setErrors({});
      setOpen(false);
      router.push(`/projects/${res.data.id}/board`);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="justify-start gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Neues Projekt
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setErrors({});
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neues Projekt</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field id="name" label="Name" errors={errors.name}>
              <Input id="name" name="name" maxLength={100} autoFocus />
            </Field>
            <Field
              id="key"
              label="Kürzel"
              hint="2–10 Zeichen, z. B. WEB – erscheint in Aufgabennummern (WEB-1)"
              errors={errors.key}
            >
              <Input id="key" name="key" maxLength={10} className="uppercase" />
            </Field>
            <Field id="description" label="Beschreibung" errors={errors.description}>
              <Textarea id="description" name="description" rows={3} />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Anlegen
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field(props: { id: string; label: string; hint?: string; errors?: string[]; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      {props.hint && !props.errors?.length && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      {props.errors?.map((msg) => (
        <p key={msg} role="alert" className="text-xs text-destructive">
          {msg}
        </p>
      ))}
    </div>
  );
}
