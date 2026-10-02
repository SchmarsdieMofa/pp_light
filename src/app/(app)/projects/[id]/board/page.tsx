import { Board } from "@/components/board/board";
import { DensityToggle } from "@/components/board/density-toggle";
import { WithTaskPanel } from "@/components/tasks/task-panel";
import { normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { can, projectCtx } from "@/server/permissions";
import { getPreferences } from "@/server/preferences/service";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function BoardPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { actor, project, role } = await loadProject(id);
  const [columns, cards, prefs] = await Promise.all([
    listStatuses(db(), project.id),
    listProjectTasks(db(), project.id, {}, { field: "position", dir: "asc" }),
    getPreferences(db(), actor.id),
  ]);

  return (
    <WithTaskPanel taskId={params.task} className="flex-1">
      <div className="flex h-full flex-col gap-3">
        <div className="flex justify-end">
          <DensityToggle density={prefs.cardDensity} />
        </div>
        <Board
          projectId={project.id}
          columns={columns.map(({ id, name, color }) => ({ id, name, color }))}
          cards={cards}
          density={prefs.cardDensity}
          canEdit={can(actor, "task.update", projectCtx(role))}
        />
      </div>
    </WithTaskPanel>
  );
}
