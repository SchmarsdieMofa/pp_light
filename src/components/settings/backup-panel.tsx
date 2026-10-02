"use client";

import { DatabaseBackup } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { requestBackupAction } from "@/app/(app)/settings/actions";
import { useRunner } from "@/components/projects/settings-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BackupRun } from "@/server/backups/service";

const STATUS: Record<BackupRun["status"], { label: string; className: string }> = {
  pending: { label: "Wartet", className: "bg-muted text-muted-foreground" },
  running: { label: "Läuft…", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  done: { label: "Fertig", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Fehlgeschlagen", className: "bg-destructive/15 text-destructive" },
};

const when = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(d);

function size(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB`;
  return `${(bytes / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`;
}

/** Start a backup and follow it; the backup container does the work and reports back through the database. */
export function BackupPanel({ runs }: { runs: BackupRun[] }) {
  const router = useRouter();
  const { pending, run } = useRunner();
  const active = runs.find((r) => r.status === "pending" || r.status === "running");
  const [waitingLong, setWaitingLong] = useState(false);

  // Follow a queued or running backup until it is finished; warn when nobody picks the job up.
  useEffect(() => {
    if (!active) return;
    const check = () => setWaitingLong(active.status === "pending" && Date.now() - new Date(active.createdAt).getTime() > 60_000);
    const timer = setInterval(() => {
      check();
      router.refresh();
    }, 3000);
    return () => {
      clearInterval(timer);
      setWaitingLong(false);
    };
  }, [active, router]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={pending || !!active}
          onClick={() =>
            run(requestBackupAction, () => {
              toast.success("Backup gestartet");
              router.refresh();
            })
          }
        >
          <DatabaseBackup /> {active ? "Backup läuft…" : "Jetzt sichern"}
        </Button>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Sichert Datenbank und Anhänge auf den Server (Ordner <code>backups</code>). Automatisch läuft es täglich nachts.
          Wiederherstellen geht nur auf dem Server – siehe README.
        </p>
      </div>
      {waitingLong && (
        <p role="status" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          Der Backup-Dienst hat den Auftrag noch nicht abgeholt. Läuft er? Auf dem Server: <code>docker compose ps backup</code>
        </p>
      )}
      {runs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Noch keine Backups.</p>
      ) : (
        <ul aria-label="Letzte Backups" className="divide-y rounded-lg border">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS[r.status].className)}>{STATUS[r.status].label}</span>
              <span className="tabular-nums">{when(new Date(r.createdAt))}</span>
              <span className="text-muted-foreground">
                {r.trigger === "scheduled" ? "automatisch" : `von ${r.requestedByName ?? "gelöschtem Konto"}`}
              </span>
              {r.sizeBytes !== null && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{size(r.sizeBytes)}</span>}
              {r.error && <p className="w-full text-xs break-words text-destructive">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
