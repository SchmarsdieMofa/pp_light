import Link from "next/link";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayInZone } from "@/lib/dates";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listArchivedProjects } from "@/server/projects/lifecycle";
import { listProjectOverview } from "@/server/projects/service";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const actor = await requireActor();
  const [projects, archived] = await Promise.all([listProjectOverview(db(), actor, todayInZone()), listArchivedProjects(db(), actor)]);
  const rawQuery = (await searchParams).q;
  const query = (typeof rawQuery === "string" ? rawQuery : "").trim().slice(0, 100);
  const needle = query.toLocaleLowerCase("de");
  const visible = needle
    ? projects.filter((project) =>
        [project.name, project.key, project.description].some((value) => value.toLocaleLowerCase("de").includes(needle)),
      )
    : projects;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projekte</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alle aktiven Projekte, auf die du Zugriff hast.</p>
        </div>
        <NewProjectDialog />
      </div>

      <form action="/projects" className="flex flex-wrap items-center gap-2">
        <label htmlFor="project-search" className="sr-only">Projekte suchen</label>
        <Input
          id="project-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Name, Kürzel oder Beschreibung suchen…"
          className="min-w-0 max-w-md flex-1"
        />
        <Button type="submit" variant="outline">Suchen</Button>
        {query && <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">Zurücksetzen</Link>}
      </form>

      <section aria-label="Projektliste" className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {query ? `${visible.length} von ${projects.length} Projekten` : `${projects.length} ${projects.length === 1 ? "Projekt" : "Projekte"}`}
        </p>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {query ? "Keine Projekte passen zu deiner Suche." : "Noch keine Projekte vorhanden. Lege dein erstes Projekt an."}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((project) => (
              <li key={project.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{project.key}</span>
                      <h2 className="min-w-0 text-base font-semibold break-words">
                        <Link href={`/projects/${project.id}/board`} className="hover:underline">{project.name}</Link>
                      </h2>
                    </div>
                    {project.description && <p className="max-w-2xl line-clamp-2 text-sm text-muted-foreground break-words">{project.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <span className="text-muted-foreground">{project.openTaskCount} offen</span>
                    {project.overdueTaskCount > 0 && <span className="font-medium text-destructive">{project.overdueTaskCount} überfällig</span>}
                    <nav aria-label={`Ansichten für ${project.name}`} className="flex items-center gap-3">
                      <Link href={`/projects/${project.id}/board`} className="text-muted-foreground hover:text-foreground">Board</Link>
                      <Link href={`/projects/${project.id}/list`} className="text-muted-foreground hover:text-foreground">Liste</Link>
                      <Link href={`/projects/${project.id}/gantt`} className="text-muted-foreground hover:text-foreground">Gantt</Link>
                    </nav>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <details className="group rounded-lg border">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>›</span>
            Archiv ({archived.length})
            <span className="ml-2 font-normal text-muted-foreground">abgeschlossene und archivierte Projekte</span>
          </summary>
          <ul aria-label="Archivierte Projekte" className="divide-y border-t">
            {archived.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{project.key}</span>
                <Link href={`/projects/${project.id}/review`} className="min-w-0 flex-1 truncate hover:underline">{project.name}</Link>
                <span className="text-xs text-muted-foreground">
                  {project.completedAt ? "Abgeschlossen" : "Archiviert"} am{" "}
                  {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(project.archivedAt!)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
