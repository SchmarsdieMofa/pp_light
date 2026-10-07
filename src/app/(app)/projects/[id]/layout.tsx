import { Archive } from "lucide-react";
import Link from "next/link";
import { ProjectTabs } from "@/components/shell/project-tabs";
import { PinButton } from "@/components/projects/pin-button";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listPinnedProjectIds } from "@/server/projects/pins";
import { countOpenQuestions } from "@/server/questions/service";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const actor = await requireActor();
  const [pinnedIds, openQuestions] = await Promise.all([listPinnedProjectIds(db(), actor.id), countOpenQuestions(db(), project.id)]);
  const pinned = pinnedIds.includes(project.id);
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 pt-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <PinButton projectId={project.id} projectName={project.name} pinned={pinned} />
        </div>
        <ProjectTabs projectId={project.id} openQuestions={openQuestions} />
      </header>
      {project.archivedAt && (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/50 px-6 py-2 text-sm">
          <Archive className="size-4 text-muted-foreground" aria-hidden />
          <span>
            {project.completedAt ? "Abgeschlossen" : "Archiviert"} am{" "}
            {new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(project.archivedAt)} · schreibgeschützt
          </span>
          <Link href={`/projects/${project.id}/review`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {project.completedAt ? "Abschlussbericht" : "Bericht"}
          </Link>
          <Link href={`/projects/${project.id}/settings#projektstatus`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Wiederherstellen
          </Link>
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col p-6">{children}</div>
    </div>
  );
}
