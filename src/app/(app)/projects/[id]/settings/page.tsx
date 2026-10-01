import { LabelManager } from "@/components/projects/label-manager";
import { db } from "@/server/db/client";
import { listLabels } from "@/server/labels/service";
import { can, projectCtx } from "@/server/permissions";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, project, role } = await loadProject(id);
  const [columns, labels] = await Promise.all([listStatuses(db(), project.id), listLabels(db(), project.id)]);
  return (
    <div className="max-w-xl space-y-8">
      <section className="space-y-1">
        <h2 className="text-sm font-medium">Kürzel</h2>
        <p className="text-sm text-muted-foreground">{project.key}</p>
      </section>
      {project.description && (
        <section className="space-y-1">
          <h2 className="text-sm font-medium">Beschreibung</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Status-Spalten</h2>
        <ul className="space-y-1">
          {columns.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
              {s.isDone && <span className="text-xs text-muted-foreground">(gilt als erledigt)</span>}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Labels</h2>
        <LabelManager projectId={project.id} labels={labels} canManage={can(actor, "project.update", projectCtx(role))} />
      </section>
    </div>
  );
}
