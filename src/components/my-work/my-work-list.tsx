"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { PartyPopper } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { completeTaskAction, reopenTaskAction } from "@/app/(app)/my-work/actions";
import { updateTaskAction } from "@/app/(app)/tasks/actions";
import { PriorityBadge } from "@/components/tasks/task-badges";
import { useTaskHref } from "@/components/tasks/use-task-href";
import { addDays } from "@/lib/dates";
import { dueLabel, MY_WORK_GROUPS, type MyWorkGroups } from "@/lib/my-work";
import { cn } from "@/lib/utils";
import type { MyWorkTask } from "@/server/my-work/service";

type GroupKey = (typeof MY_WORK_GROUPS)[number]["key"];

/** Open tasks assigned to me, by due date. Complete with one click (undo in the toast), push to today/tomorrow inline. */
export function MyWorkList(props: { groups: MyWorkGroups<MyWorkTask>; today: string; colorOf: Record<string, string> }) {
  const [, startTransition] = useTransition();
  const [hidden, hide] = useOptimistic<string[], string>([], (current, id) => [...current, id]);
  const taskHref = useTaskHref();

  function complete(task: MyWorkTask) {
    startTransition(async () => {
      hide(task.id);
      const res = await completeTaskAction(task.id);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(`${task.key}-${task.number} erledigt`, {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            const undone = await reopenTaskAction(task.id);
            if (!undone.ok) toast.error(undone.error.message);
          },
        },
      });
    });
  }

  function reschedule(task: MyWorkTask, dueDate: string, label: string) {
    startTransition(async () => {
      hide(task.id);
      const res = await updateTaskAction(task.id, task.updatedAt, { dueDate });
      if (!res.ok) toast.error(res.error.message);
      else toast.success(`${task.key}-${task.number} auf ${label} verschoben`);
    });
  }

  const total = MY_WORK_GROUPS.reduce((sum, g) => sum + props.groups[g.key].length, 0);
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <PartyPopper className="size-6 text-muted-foreground" aria-hidden />
        <p className="font-medium">Alles erledigt.</p>
        <p className="text-sm text-muted-foreground">Dir sind gerade keine offenen Aufgaben zugewiesen.</p>
      </div>
    );
  }

  const tomorrow = addDays(props.today, 1);
  const actionsFor = (key: GroupKey): { label: string; date: string }[] =>
    key === "overdue" || key === "none" ? [{ label: "Heute", date: props.today }, { label: "Morgen", date: tomorrow }]
      : key === "today" ? [{ label: "Morgen", date: tomorrow }]
        : [{ label: "Heute", date: props.today }];

  return (
    <div className="space-y-6">
      {MY_WORK_GROUPS.map(({ key, label }) => {
        const tasks = props.groups[key].filter((task) => !hidden.includes(task.id));
        if (tasks.length === 0) return null;
        return (
          <section key={key} aria-label={label} className="space-y-2">
            <h2 className={cn("flex items-baseline gap-2 text-sm font-medium", key === "overdue" && "text-destructive")}>
              {label} <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {tasks.map((task) => (
                <li key={task.id} className="group flex items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    aria-label={`${task.key}-${task.number} ${task.title} erledigen`}
                    onCheckedChange={() => complete(task)}
                  />
                  <Link href={taskHref(task.id)} scroll={false} className="min-w-0 flex-1">
                    <span className="block truncate font-medium hover:underline">{task.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: props.colorOf[task.projectId] }} aria-hidden />
                      <span className="truncate">{task.projectName}</span>
                      <span className="tabular-nums">· {task.key}-{task.number}</span>
                    </span>
                  </Link>
                  <span className="hidden items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:flex">
                    {actionsFor(key).map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        aria-label={`${task.key}-${task.number} auf ${action.label} verschieben`}
                        onClick={() => reschedule(task, action.date, action.label === "Heute" ? "heute" : "morgen")}
                        className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        {action.label}
                      </button>
                    ))}
                  </span>
                  <span className="hidden w-16 sm:block">{task.priority !== "none" && <PriorityBadge priority={task.priority} />}</span>
                  <span
                    className={cn(
                      "w-24 shrink-0 text-right text-xs tabular-nums",
                      key === "overdue" ? "font-medium text-destructive" : key === "today" ? "font-medium text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                    )}
                  >
                    {task.dueDate ? dueLabel(task.dueDate, props.today) : "–"}
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
