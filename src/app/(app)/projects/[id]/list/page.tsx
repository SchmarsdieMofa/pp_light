import { EmptyState } from "@/components/shell/empty-state";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskTable } from "@/components/tasks/task-table";
import { parseTaskListParams } from "@/lib/task-list-params";
import { normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { listPhases } from "@/server/phases/queries";
import { loadProject } from "@/server/projects/loaders";
import { listMembers, listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function ListPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const { filters, sort } = parseTaskListParams(params);
  const [rows, statuses, members, labels, phases] = await Promise.all([
    listProjectTasks(db(), project.id, filters, sort),
    listStatuses(db(), project.id),
    listMembers(db(), project.id),
    listLabels(db(), project.id),
    listPhases(db(), project.id),
  ]);
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <WithTaskPanel taskId={params.task}>
      <div className="space-y-4">
        {can(actor, "task.create", projectCtx(role)) && (
          <QuickAdd projectId={project.id} label="Neue Aufgabe" placeholder="Neue Aufgabe… (Enter)" />
        )}
        <TaskFilters statuses={statuses} members={members} labels={labels} phases={phases} filters={filters} />
        {rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "Keine Treffer" : "Noch keine Aufgaben"}
            text={hasFilters ? "Kein Eintrag passt zu den Filtern." : "Lege oben die erste Aufgabe an."}
          />
        ) : (
          <div className="overflow-x-auto">
            <TaskTable rows={rows} sort={sort} basePath={`/projects/${project.id}/list`} params={params} />
          </div>
        )}
      </div>
    </WithTaskPanel>
  );
}
