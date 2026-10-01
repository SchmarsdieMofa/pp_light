"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { deleteAttachmentAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/server/tasks/queries";

const inlineTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function TaskAttachments({ detail }: { detail: TaskDetail }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    setPending(true);
    try {
      const response = await fetch(`/api/tasks/${detail.id}/attachments`, { method: "POST", body: form });
      if (!response.ok) {
        const error = await response.json() as { error?: string; message?: string };
        toast.error(error.message ?? error.error ?? "Hochladen fehlgeschlagen.");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Hochladen fehlgeschlagen.");
    } finally {
      setPending(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    const result = await deleteAttachmentAction(id);
    setDeletingId(null);
    if (!result.ok) toast.error(result.error.message);
  }

  return <section className="space-y-3 border-t pt-4">
    <h2 className="text-sm font-medium">Anhänge ({detail.attachments.length})</h2>
    {detail.attachments.length === 0 && <p className="text-sm text-muted-foreground">Keine Anhänge.</p>}
    <ul className="space-y-2">
      {detail.attachments.map((attachment) => {
        const download = `/api/attachments/${attachment.id}`;
        const image = inlineTypes.has(attachment.mime);
        const canDelete = attachment.uploadedBy === detail.viewerId || detail.canManageProject;
        return <li key={attachment.id} className="space-y-2 rounded-md border p-3 text-sm">
          {image && (
            // The protected same-origin route serves only safe raster MIME types inline.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${download}?inline=1`} alt={attachment.filename} className="max-h-48 max-w-full rounded object-contain" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={download} className="min-w-0 truncate text-primary underline" download>{attachment.filename}</a>
            <span className="text-xs text-muted-foreground">{Math.ceil(attachment.size / 1024)} KB · {attachment.uploaderName}</span>
            {canDelete && <Button className="ml-auto" size="sm" variant="ghost" disabled={deletingId === attachment.id}
              onClick={() => void remove(attachment.id)}>Löschen</Button>}
          </div>
        </li>;
      })}
    </ul>
    {detail.canUpload && <div className="space-y-1 text-sm">
      <p className="font-medium">Datei hochladen</p>
      <input ref={input} type="file" aria-label="Datei hochladen" disabled={pending} className="sr-only"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
        Datei auswählen
      </Button>
      {pending && <span className="ml-2 text-xs text-muted-foreground">Wird hochgeladen…</span>}
    </div>}
  </section>;
}
