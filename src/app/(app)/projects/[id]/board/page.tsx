import Link from "next/link";
import { DueDate } from "@/components/tasks/task-badges";
import { buildHref, normalizeSearchParams } from "@/lib/urls";
import { db } from "@/server/db/client";
import { loadProject } from "@/server/projects/loaders";
import { listStatuses } from "@/server/projects/service";
import { listProjectTasks } from "@/server/tasks/queries";

export default async function BoardPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await props.params;
  const params = normalizeSearchParams(await props.searchParams);
  const { project } = await loadProject(id);
  const [columns, rows] = await Promise.all([
    listStatuses(db(), project.id),
    listProjectTasks(db(), project.id, {}, { field: "status", dir: "asc" }),
  ]);
  const basePath = `/projects/${project.id}/board`;

  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map((status) => {
        const cards = rows.filter((r) => r.status.id === status.id);
        return (
          <section key={status.id} aria-label={status.name} className="w-72 shrink-0 rounded-lg bg-muted/40 p-3">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
              {status.name}
              <span className="text-xs text-muted-foreground">{cards.length}</span>
            </h2>
            {cards.length === 0 && <p className="text-xs text-muted-foreground">Keine Aufgaben</p>}
            <ul className="space-y-2">
              {cards.map((card) => (
                <li key={card.id}>
                  <Link
                    href={buildHref(basePath, params, { task: card.id })}
                    className="block rounded-md border bg-background p-2 text-sm shadow-xs hover:border-primary/40"
                  >
                    <span className="block text-xs text-muted-foreground">
                      {card.key}-{card.number}
                    </span>
                    <span className="block">{card.title}</span>
                    {card.dueDate && <DueDate date={card.dueDate} isDone={card.status.isDone} />}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
