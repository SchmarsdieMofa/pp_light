import type { TaskDetail } from "@/server/tasks/queries";

/** Collapsed by default: the history is rarely needed and would otherwise push comments out of view. */
export function TaskActivity({ entries }: { entries: TaskDetail["activity"] }) {
  return <details className="group border-t pt-4">
    <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-foreground">
      <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>›</span> Verlauf ({entries.length})
    </summary>
    {entries.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Noch keine Einträge.</p> :
      <ol className="mt-3 space-y-2">
        {entries.map((entry) => <li key={entry.id} className="text-xs">
          <span className="font-medium">{entry.actorName}</span> {entry.text}
          <time className="ml-2 text-muted-foreground" dateTime={entry.createdAt}>
            {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(entry.createdAt))}
          </time>
        </li>)}
      </ol>}
  </details>;
}
