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
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <Link href={`/projects/${detail.projectId}/list`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {detail.projectName}
      </Link>
      <TaskEditor key={detail.id} detail={detail} />
    </div>
  );
}
