import type { TaskDetail } from "@/server/tasks/queries";

export function TaskActivity({ entries }: { entries: TaskDetail["activity"] }) {
  return <section className="space-y-3 border-t pt-4">
    <h2 className="text-sm font-medium">Verlauf</h2>
    {entries.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Einträge.</p> :
      <ol className="space-y-2">
        {entries.map((entry) => <li key={entry.id} className="text-xs">
          <span className="font-medium">{entry.actorName}</span> {entry.text}
          <time className="ml-2 text-muted-foreground" dateTime={entry.createdAt}>
            {new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(entry.createdAt))}
          </time>
        </li>)}
      </ol>}
  </section>;
}
