"use client";

import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { completeProjectAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { useRunner } from "./settings-ui";

/** Last step of the review: what to do with open tasks, a closing note, then close. */
export function CloseProjectForm(props: { projectId: string; openCount: number }) {
  const [note, setNote] = useState("");
  const [closeOpenTasks, setCloseOpenTasks] = useState(false);
  const { pending, run } = useRunner();
  const router = useRouter();
  return (
    <form
      aria-label="Projekt abschließen"
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => completeProjectAction(props.projectId, { note, closeOpenTasks }), () => {
          toast.success("Projekt abgeschlossen und archiviert");
          router.refresh();
        });
      }}
    >
      <h3 className="text-sm font-medium">Projekt abschließen</h3>
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">Abschlussnotiz (optional)</span>
        <textarea
          value={note}
          maxLength={5000}
          rows={4}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Was wurde erreicht? Was lief gut, was nehmen wir fürs nächste Projekt mit?"
          className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>
      {props.openCount > 0 && (
        <fieldset className="space-y-1.5 text-sm">
          <legend className="mb-1 text-muted-foreground">{props.openCount} {props.openCount === 1 ? "Aufgabe ist" : "Aufgaben sind"} noch offen:</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="open-tasks" checked={!closeOpenTasks} onChange={() => setCloseOpenTasks(false)} />
            So lassen, wie sie sind
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="open-tasks" checked={closeOpenTasks} onChange={() => setCloseOpenTasks(true)} />
            Alle als erledigt markieren
          </label>
        </fieldset>
      )}
      <Button type="submit" disabled={pending}>
        <ClipboardCheck /> Projekt abschließen
      </Button>
    </form>
  );
}
