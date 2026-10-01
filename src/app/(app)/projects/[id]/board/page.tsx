import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await loadProject(id);
  const columns = await listStatuses(db(), project.id);
  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map((status) => (
        <section key={status.id} aria-label={status.name} className="w-72 shrink-0 rounded-lg bg-muted/40 p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
            {status.name}
          </h2>
          <p className="text-xs text-muted-foreground">Keine Aufgaben</p>
        </section>
      ))}
    </div>
  );
}
