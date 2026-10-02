import { ChevronRight, FolderKanban } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskEditor } from "@/components/tasks/task-editor";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, id);
  if (!detail) notFound();
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        <Link href={`/projects/${detail.projectId}/board`} title="Zum Projekt" className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 -ml-2 hover:bg-muted hover:text-foreground">
          <FolderKanban className="size-3.5 shrink-0" />
          <span className="truncate">{detail.projectName}</span>
        </Link>
        <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden />
        <span className="shrink-0 font-medium tabular-nums text-foreground">{detail.key}-{detail.number}</span>
      </nav>
      <TaskEditor key={detail.id} detail={detail} />
    </div>
  );
}
