"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { completeTaskAction } from "@/app/(app)/my-work/actions";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { formatDate } from "@/lib/dates";
import { MY_WORK_GROUPS, type MyWorkGroups } from "@/lib/my-work";
import { cn } from "@/lib/utils";
import type { MyWorkTask } from "@/server/my-work/service";

export function MyWorkList({ groups }: { groups: MyWorkGroups<MyWorkTask> }) {
  const [, startTransition] = useTransition();
  const [hidden, hide] = useOptimistic<string[], string>([], (current, id) => [...current, id]);

  function complete(task: MyWorkTask) {
    startTransition(async () => {
      hide(task.id);
      const res = await completeTaskAction(task.id);
      if (!res.ok) toast.error(res.error.message);
      else toast.success(`${task.key}-${task.number} erledigt`);
    });
  }

  const total = MY_WORK_GROUPS.reduce((sum, g) => sum + groups[g.key].length, 0);
  if (total === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Dir sind gerade keine offenen Aufgaben zugewiesen.</p>;
  }

  return (
    <div className="space-y-6">
      {MY_WORK_GROUPS.map(({ key, label }) => {
        const tasks = groups[key].filter((task) => !hidden.includes(task.id));
        if (tasks.length === 0) return null;
        return (
          <section key={key} aria-label={label} className="space-y-2">
            <h2 className={cn("text-sm font-medium", key === "overdue" && "text-destructive")}>
              {label} <span className="text-muted-foreground">({tasks.length})</span>
            </h2>
            <ul className="divide-y rounded-md border">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${task.key}-${task.number} ${task.title} erledigen`}
                    onChange={() => complete(task)}
                  />
                  <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate hover:underline">
                    <span className="text-xs text-muted-foreground">{task.key}-{task.number}</span> {task.title}
                  </Link>
                  <PriorityBadge priority={task.priority} />
                  <span className="hidden w-32 truncate text-xs text-muted-foreground sm:inline">{task.projectName}</span>
                  <span className={cn("w-20 text-right text-xs", key === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {task.dueDate ? formatDate(task.dueDate) : "–"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
