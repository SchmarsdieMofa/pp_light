"use client";

import Link from "next/link";
import { MAX_TASK_DEPTH, taskDepth } from "@/lib/task-path";
import type { TaskDetail } from "@/server/tasks/queries";
import { InfoHint } from "@/components/ui/info-hint";
import { QuickAdd } from "./quick-add";
import { useTaskHref } from "./use-task-href";

export function TaskSubtasks({ detail }: { detail: TaskDetail }) {
  const href = useTaskHref();
  const done = detail.subtasks.filter((s) => s.isDone).length;
  return (
    <section aria-label="Unteraufgaben" className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        <span>
          Unteraufgaben {detail.subtasks.length > 0 && <span className="text-muted-foreground">{done}/{detail.subtasks.length}</span>}
        </span>
        <InfoHint topic="Was sind Unteraufgaben?">Eigene Aufgaben unterhalb dieser, mit Nummer, Status, Zuständigen und Terminen (z. B. 3.1).</InfoHint>
      </h3>
      <ul className="space-y-1">
        {detail.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span aria-hidden>{s.isDone ? "☑" : "☐"}</span>
            <Link href={href(s.id)} className={s.isDone ? "text-muted-foreground line-through" : "hover:underline"}>
              <span className="text-xs text-muted-foreground">
                {detail.key}-{s.path}
              </span>{" "}
              {s.title}
            </Link>
          </li>
        ))}
      </ul>
      {detail.hintAllSubtasksDone && (
        <p role="status" className="rounded-md bg-muted px-2 py-1 text-xs">
          Alle Unteraufgaben sind erledigt – Aufgabe abschließen?
        </p>
      )}
      {detail.canEdit && taskDepth(detail.path) < MAX_TASK_DEPTH && (
        <QuickAdd projectId={detail.projectId} parentId={detail.id} label="Neue Unteraufgabe" placeholder="Unteraufgabe hinzufügen… (Enter)" />
      )}
    </section>
  );
}
