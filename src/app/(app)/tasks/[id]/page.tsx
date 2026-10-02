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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={`/projects/${detail.projectId}/list`} className="hover:text-foreground">
          ← {detail.projectName}
        </Link>
        <span aria-hidden>·</span>
        <span className="font-medium tabular-nums">{detail.key}-{detail.number}</span>
      </p>
      <TaskEditor key={detail.id} detail={detail} />
    </div>
  );
}
