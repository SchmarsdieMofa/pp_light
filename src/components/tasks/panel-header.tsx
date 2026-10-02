"use client";

import { ChevronRight, FolderKanban, Maximize2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

const action = "inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground";

/** Top bar of the task overlay: where the task lives (project → reference) and how to leave. */
export function PanelHeader({ taskId, reference, project }: { taskId?: string; reference?: string; project?: { id: string; name: string } }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const closeHref = buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { task: null });
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-sm text-muted-foreground md:px-6">
      <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1">
        {project && (
          <>
            <Link href={`/projects/${project.id}/board`} className={`${action} min-w-0`} title="Zum Projekt">
              <FolderKanban className="size-3.5 shrink-0" />
              <span className="truncate">{project.name}</span>
            </Link>
            <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
          </>
        )}
        <span className="shrink-0 font-medium tabular-nums text-foreground">{reference}</span>
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {taskId && (
          <Link href={`/tasks/${taskId}`} className={action} aria-label="Als Seite öffnen">
            <Maximize2 className="size-3.5" /> <span className="hidden sm:inline">Als Seite öffnen</span>
          </Link>
        )}
        <Link href={closeHref} scroll={false} className={action} aria-label="Schließen" title="Schließen (Esc)">
          <X className="size-4" /> <span className="hidden sm:inline">Schließen</span>
        </Link>
      </div>
    </div>
  );
}
