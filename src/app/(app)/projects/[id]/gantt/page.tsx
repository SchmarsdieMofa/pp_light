import { GanttView } from "@/components/gantt/gantt-view";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { getGanttData } from "@/server/gantt/queries";
import { can, projectCtx } from "@/server/permissions";
import { loadProject } from "@/server/projects/loaders";

export default async function GanttPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const data = await getGanttData(db(), project.id);
  return (
    <WithTaskPanel taskId={params.task}>
      <p className="rounded-md border p-4 text-sm md:hidden">Der Gantt-Zeitplan ist ab Tablet-Breite verfügbar.</p>
      <div className="hidden md:block">
        <GanttView data={data} projectKey={project.key} canEdit={can(actor, "task.update", projectCtx(role))} />
      </div>
    </WithTaskPanel>
  );
}
