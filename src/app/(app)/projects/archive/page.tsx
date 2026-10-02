import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { RestoreProjectButton } from "@/components/projects/project-lifecycle";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listArchivedProjects } from "@/server/projects/lifecycle";

const KINDS = [
  { value: "alle", label: "Alle" },
  { value: "abgeschlossen", label: "Abgeschlossen" },
  { value: "archiviert", label: "Archiviert" },
] as const;
type Kind = (typeof KINDS)[number]["value"];

const dateDe = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
const first = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; art?: string | string[] }> }) {
  const actor = await requireActor();
  const archived = await listArchivedProjects(db(), actor);
  const params = await searchParams;
  const query = first(params.q).trim().slice(0, 100);
  const kind: Kind = KINDS.some((k) => k.value === first(params.art)) ? (first(params.art) as Kind) : "alle";
  const needle = query.toLocaleLowerCase("de");
  const visible = archived.filter(
    (p) =>
      (kind === "alle" || (kind === "abgeschlossen") === !!p.completedAt) &&
      (!needle || [p.name, p.key, p.description, p.closingNote].some((v) => v.toLocaleLowerCase("de").includes(needle))),
  );
  const hrefFor = (k: Kind) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (k !== "alle") sp.set("art", k);
    const s = sp.toString();
    return s ? `/projects/archive?${s}` : "/projects/archive";
  };
  const completedCount = archived.filter((p) => p.completedAt).length;
  const counts: Record<Kind, number> = { alle: archived.length, abgeschlossen: completedCount, archiviert: archived.length - completedCount };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Archiv</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Abgeschlossene und archivierte Projekte. Sie sind schreibgeschützt und lassen sich jederzeit wiederherstellen.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Archiv filtern" className="flex gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => (
            <Link
              key={k.value}
              href={hrefFor(k.value)}
              aria-current={kind === k.value ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
                kind === k.value && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {k.label} <span className="text-xs text-muted-foreground">{counts[k.value]}</span>
            </Link>
          ))}
        </nav>
        <form action="/projects/archive" className="flex min-w-0 flex-1 items-center gap-2">
          {kind !== "alle" && <input type="hidden" name="art" value={kind} />}
          <label htmlFor="archive-search" className="sr-only">Archiv durchsuchen</label>
          <Input id="archive-search" name="q" type="search" defaultValue={query} placeholder="Name, Kürzel oder Notiz suchen…" className="min-w-0 max-w-sm flex-1" />
          <Button type="submit" variant="outline">Suchen</Button>
        </form>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {archived.length === 0
            ? "Noch keine Projekte im Archiv. Abgeschlossene und archivierte Projekte erscheinen hier."
            : "Keine Projekte passen zu deiner Auswahl."}
        </p>
      ) : (
        <ul aria-label="Archivierte Projekte" className="space-y-3">
          {visible.map((project) => {
            const percent = project.taskTotal ? Math.round((project.taskDone / project.taskTotal) * 100) : 0;
            return (
              <li key={project.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{project.key}</span>
                      <h2 className="min-w-0 text-base font-semibold break-words">
                        <Link href={`/projects/${project.id}/board`} className="hover:underline">{project.name}</Link>
                      </h2>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          project.completedAt ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {project.completedAt ? "Abgeschlossen" : "Archiviert"} am {dateDe(project.archivedAt!)}
                      </span>
                    </div>
                    {project.closingNote ? (
                      <p className="max-w-2xl line-clamp-2 text-sm break-words">{project.closingNote}</p>
                    ) : (
                      project.description && <p className="max-w-2xl line-clamp-2 text-sm text-muted-foreground break-words">{project.description}</p>
                    )}
                    <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full bg-emerald-500" style={{ width: `${percent}%` }} />
                      </div>
                      {project.taskDone} von {project.taskTotal} Aufgaben erledigt
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/projects/${project.id}/review`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                      <ClipboardCheck /> {project.completedAt ? "Abschlussbericht" : "Bericht"}
                    </Link>
                    {project.canRestore && <RestoreProjectButton projectId={project.id} projectName={project.name} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
