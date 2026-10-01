import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";
import { PanelHeader } from "./panel-header";
import { TaskEditor } from "./task-editor";

export async function TaskPanel({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, taskId);
  return (
    <aside aria-label="Aufgabe" className="w-[28rem] max-w-full shrink-0 space-y-4 border-l pl-6">
      <PanelHeader taskId={detail?.id} />
      {detail ? <TaskEditor key={detail.id} detail={detail} /> : <p className="text-sm text-muted-foreground">Aufgabe nicht gefunden.</p>}
    </aside>
  );
}

export function WithTaskPanel({ taskId, children }: { taskId?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">{children}</div>
      {taskId && <TaskPanel taskId={taskId} />}
    </div>
  );
}
