import { EmptyState } from "@/components/shell/empty-state";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskTable } from "@/components/tasks/task-table";
import { todayInZone } from "@/lib/dates";
import { parseTaskListParams } from "@/lib/task-list-params";
import { normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { listPhases } from "@/server/phases/queries";
import { loadProject } from "@/server/projects/loaders";
import { listMembers, listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function CompletedPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const { filters, sort } = parseTaskListParams(params);
  const [rows, statuses, members, labels, phases] = await Promise.all([
    listProjectTasks(db(), project.id, { ...filters, completion: "done" }, sort),
    listStatuses(db(), project.id), listMembers(db(), project.id),
    listLabels(db(), project.id), listPhases(db(), project.id),
  ]);
  const grouped = params.group !== "none";
  return (
    <WithTaskPanel taskId={params.task}>
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <h2 className="text-lg font-semibold">Erledigte Aufgaben</h2>
        <TaskFilters statuses={statuses.filter((s) => s.isDone)} members={members} labels={labels} phases={phases} filters={filters} grouped={grouped} count={rows.length} />
        {rows.length === 0 ? <EmptyState title="Keine erledigten Aufgaben" text="Hier findest du alle abgeschlossenen Aufgaben des Projekts." /> : (
          <div className="relative overflow-x-auto rounded-lg border">
            <TaskTable rows={rows} statuses={statuses} sort={sort} grouped={grouped} expandDone
              canEdit={can(actor, "task.update", projectCtx(role))} today={todayInZone()}
              basePath={`/projects/${project.id}/completed`} params={params} />
          </div>
        )}
      </div>
    </WithTaskPanel>
  );
}
