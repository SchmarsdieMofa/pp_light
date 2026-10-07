import { Archive, ChevronRight, Folder as FolderIcon } from "lucide-react";
import Link from "next/link";
import { FolderManageButton } from "@/components/folders/folder-manage-button";
import { NewFolderButton } from "@/components/folders/new-folder-button";
import { PinButton } from "@/components/projects/pin-button";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayInZone } from "@/lib/dates";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { listFolders } from "@/server/folders/service";
import { listArchivedProjects } from "@/server/projects/lifecycle";
import { listPinnedProjectIds } from "@/server/projects/pins";
import { listProjectOverview } from "@/server/projects/service";

type Overview = Awaited<ReturnType<typeof listProjectOverview>>[number];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const actor = await requireActor();
  const [overview, archived, pinnedIds, folders] = await Promise.all([
    listProjectOverview(db(), actor, todayInZone()),
    listArchivedProjects(db(), actor),
    listPinnedProjectIds(db(), actor.id),
    listFolders(db(), actor),
  ]);
  const pinned = new Set(pinnedIds);
  // Pinned projects first, otherwise the alphabetical order stays.
  const projects = [...overview.filter((p) => pinned.has(p.id)), ...overview.filter((p) => !pinned.has(p.id))];
  const rawQuery = (await searchParams).q;
  const query = (typeof rawQuery === "string" ? rawQuery : "").trim().slice(0, 100);
  const needle = query.toLocaleLowerCase("de");
  const visible = needle
    ? projects.filter((project) =>
        [project.name, project.key, project.description].some((value) => value.toLocaleLowerCase("de").includes(needle)),
      )
    : projects;

  // One block per folder the person is in (also empty ones, unless searching), then everything else.
  // Folders of which the person is not a member stay unnamed: their projects show up in the last block.
  const folderIds = new Set(folders.map((folder) => folder.id));
  const blocks = [
    ...folders.map((folder) => ({ folder, items: visible.filter((project) => project.folderId === folder.id) })),
    { folder: null, items: visible.filter((project) => !project.folderId || !folderIds.has(project.folderId)) },
  ].filter((block) => block.items.length > 0 || (block.folder && !query));
  const grouped = folders.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Projekte</h1>
          <p className="mt-1 text-sm text-muted-foreground">Alle aktiven Projekte, auf die du Zugriff hast.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NewFolderButton variant="outline" className="gap-2" />
          <NewProjectDialog folders={folders} />
        </div>
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
        {blocks.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {query ? "Keine Projekte passen zu deiner Suche." : "Noch keine Projekte vorhanden. Lege dein erstes Projekt an."}
          </p>
        ) : (
          <div className="space-y-6">
            {blocks.map((block) => (
              <div key={block.folder?.id ?? "none"} className="space-y-3">
                {block.folder ? (
                  <div className="flex items-center justify-between gap-2 border-b pb-1">
                    <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{block.folder.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">{block.items.length}</span>
                    </h2>
                    <FolderManageButton folderId={block.folder.id} folderName={block.folder.name} />
                  </div>
                ) : (
                  grouped && <h2 className="border-b pb-1 text-sm font-semibold text-muted-foreground">Weitere Projekte</h2>
                )}
                {block.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Noch keine Projekte in diesem Ordner.</p>
                ) : (
                  <ul className="space-y-3">
                    {block.items.map((project) => (
                      <ProjectCard key={project.id} project={project} pinned={pinned.has(project.id)} />
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <Link href="/projects/archive" className="flex items-center gap-2 rounded-lg border px-4 py-3 text-sm hover:bg-muted/50">
          <Archive className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">Archiv ({archived.length})</span>
          <span className="text-muted-foreground">abgeschlossene und archivierte Projekte</span>
          <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function ProjectCard({ project, pinned }: { project: Overview; pinned: boolean }) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{project.key}</span>
            <h3 className="min-w-0 text-base font-semibold break-words">
              <Link href={`/projects/${project.id}/board`} className="hover:underline">{project.name}</Link>
            </h3>
            <PinButton projectId={project.id} projectName={project.name} pinned={pinned} />
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
  );
}
