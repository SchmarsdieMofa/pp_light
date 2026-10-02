"use client";

import { Archive, ClipboardCheck, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { archiveProjectAction, deleteProjectAction, restoreProjectAction } from "@/app/(app)/projects/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConfirmAction, useRunner } from "./settings-ui";

function dateDe(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date(iso));
}

/** Complete (with review), archive or restore the project. */
export function ProjectLifecycle(props: { projectId: string; archivedAt: string | null; completedAt: string | null }) {
  const { pending, run } = useRunner();
  const router = useRouter();
  const reviewHref = `/projects/${props.projectId}/review`;

  if (props.archivedAt) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-sm">
          {props.completedAt ? `Abgeschlossen am ${dateDe(props.completedAt)}.` : `Archiviert am ${dateDe(props.archivedAt)}.`}
          <span className="block text-muted-foreground">Das Projekt ist schreibgeschützt und taucht in Listen, Suche und Kalender nicht mehr auf.</span>
        </p>
        <Link href={reviewHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ClipboardCheck /> {props.completedAt ? "Abschlussbericht" : "Bericht ansehen"}
        </Link>
        <Button type="button" size="sm" disabled={pending}
          onClick={() => run(() => restoreProjectAction(props.projectId), () => { toast.success("Projekt wiederhergestellt"); router.refresh(); })}>
          <RotateCcw /> Wiederherstellen
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Projekt abschließen</p>
        <p className="flex-1 text-sm text-muted-foreground">Ergebnis prüfen, offene Aufgaben klären, eine Abschlussnotiz festhalten – danach ist das Projekt archiviert.</p>
        <Link href={reviewHref} className={cn(buttonVariants({ size: "sm" }), "self-start")}>
          <ClipboardCheck /> Abschluss-Review starten
        </Link>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-sm font-medium">Archivieren</p>
        <p className="flex-1 text-sm text-muted-foreground">Pausiert oder nicht mehr verfolgt? Ohne Bericht ausblenden – jederzeit wiederherstellbar.</p>
        <div className="self-start">
          <ConfirmAction
            trigger={<><Archive /> Archivieren</>}
            triggerVariant="outline"
            triggerSize="sm"
            title="Projekt archivieren?"
            description="Es verschwindet aus Sidebar, Suche und Kalender und wird schreibgeschützt. Du findest es im Archiv und kannst es dort wiederherstellen."
            confirmLabel="Archivieren"
            pending={pending}
            onConfirm={() => run(() => archiveProjectAction(props.projectId), () => { toast.success("Projekt archiviert"); router.refresh(); })}
          />
        </div>
      </div>
    </div>
  );
}

/** Deleting needs the key typed in: it removes the project for everyone, with tasks, comments and files. */
export function DeleteProject(props: { projectId: string; projectKey: string; projectName: string }) {
  const [confirm, setConfirm] = useState("");
  const { pending, run } = useRunner();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        Löscht das Projekt endgültig – mit allen Aufgaben, Kommentaren und Dateien. Lässt sich nicht rückgängig machen.
      </p>
      <ConfirmAction
        trigger={<><Trash2 /> Projekt löschen</>}
        triggerVariant="destructive"
        triggerSize="sm"
        title={`„${props.projectName}“ endgültig löschen?`}
        description={<>Zur Bestätigung das Kürzel <strong className="font-mono">{props.projectKey}</strong> eingeben.</>}
        confirmLabel="Endgültig löschen"
        pending={pending}
        confirmDisabled={confirm.trim().toUpperCase() !== props.projectKey}
        onConfirm={() => run(() => deleteProjectAction(props.projectId, confirm), () => {
          toast.success(`${props.projectName} gelöscht`);
          router.push("/projects");
        })}
      >
        <input
          aria-label="Kürzel zur Bestätigung"
          autoComplete="off"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={props.projectKey}
          className="h-9 w-full rounded-md border bg-background px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </ConfirmAction>
    </div>
  );
}

/** Restore straight from the archive list. */
export function RestoreProjectButton(props: { projectId: string; projectName: string }) {
  const { pending, run } = useRunner();
  const router = useRouter();
  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} aria-label={`${props.projectName} wiederherstellen`}
      onClick={() => run(() => restoreProjectAction(props.projectId), () => { toast.success(`${props.projectName} wiederhergestellt`); router.refresh(); })}>
      <RotateCcw /> Wiederherstellen
    </Button>
  );
}
