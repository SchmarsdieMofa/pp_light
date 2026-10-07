"use client";

import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createFolderAction } from "@/app/(app)/folders/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderDialog } from "./folder-dialog";

/** Anyone may create a folder; afterwards its dialog opens to add people. */
export function NewFolderButton({ variant = "ghost", className }: { variant?: "ghost" | "outline"; className?: string }) {
  const [open, setOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    startTransition(async () => {
      const res = await createFolderAction(name);
      if (!res.ok) {
        const fieldMessage = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : undefined;
        setError(fieldMessage ?? res.error.message);
        if (!fieldMessage && res.error.code !== "VALIDATION") toast.error(res.error.message);
        return;
      }
      setError("");
      setOpen(false);
      setCreatedId(res.data.id);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant={variant} size="sm" className={className ?? "justify-start gap-2"} onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" /> Neuer Ordner
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuer Ordner</DialogTitle>
            <DialogDescription>
              Ein Ordner bündelt Projekte. Wen du in den Ordner aufnimmst, hat die gewählte Rolle in allen Projekten darin, auch in künftigen. Du wirst Owner des Ordners.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">Name</Label>
              <Input id="folder-name" name="name" maxLength={80} autoFocus />
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>Anlegen</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {createdId && <FolderDialog folderId={createdId} open onOpenChange={(next) => { if (!next) setCreatedId(null); }} />}
    </>
  );
}
