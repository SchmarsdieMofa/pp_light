import { cn } from "@/lib/utils";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { getTaskDetail } from "@/server/tasks/queries";
import { PanelHeader } from "./panel-header";
import { TaskEditor } from "./task-editor";
import { TaskOverlay } from "./task-overlay";

export async function TaskPanel({ taskId }: { taskId: string }) {
  const actor = await requireActor();
  const detail = await getTaskDetail(db(), actor, taskId);
  return (
    <TaskOverlay label={detail ? `Aufgabe ${detail.key}-${detail.number}` : "Aufgabe"}>
      <PanelHeader
        taskId={detail?.id}
        reference={detail ? `${detail.key}-${detail.number}` : undefined}
        project={detail ? { id: detail.projectId, name: detail.projectName } : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
        {detail ? <TaskEditor key={detail.id} detail={detail} /> : <p className="text-sm text-muted-foreground">Aufgabe nicht gefunden.</p>}
      </div>
    </TaskOverlay>
  );
}

/** The view itself plus, when `?task=` is set, the task overlay above it. */
export function WithTaskPanel({ taskId, className, children }: { taskId?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {taskId && <TaskPanel taskId={taskId} />}
    </div>
  );
}
