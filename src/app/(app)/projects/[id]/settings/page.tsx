import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const columns = await listStatuses(db(), project.id);
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
    </div>
  );
}
