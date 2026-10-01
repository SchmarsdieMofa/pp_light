import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";
import { PanelHeader } from "./panel-header";
import { TaskEditor } from "./task-editor";

export async function TaskPanel({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, taskId);
  return (
    <aside
      aria-label="Aufgabe"
      className="fixed inset-0 z-30 space-y-4 overflow-y-auto bg-background p-4 md:static md:z-auto md:w-[28rem] md:max-w-full md:shrink-0 md:overflow-visible md:border-l md:p-0 md:pl-6"
    >
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
