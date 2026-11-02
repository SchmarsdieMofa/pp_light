import { addDays, formatDate, weekEnd } from "./dates";
import { TASK_PRIORITIES } from "./enums";
import type { MyWorkTask } from "@/server/my-work/service";

export type MyWorkGroups<T> = { overdue: T[]; today: T[]; week: T[]; later: T[]; none: T[] };

export const MY_WORK_GROUPS = [
  { key: "overdue", label: "Überfällig" },
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "later", label: "Später" },
  { key: "none", label: "Ohne Termin" },
] as const;

export function mergeTaskOrder(current: string[], ordered: string[]): string[] {
  const selected = new Set(ordered);
  let index = 0;
  return current.map((id) => selected.has(id) ? ordered[index++] : id);
}

export function orderMyWork<T extends { id: string }>(tasks: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...tasks].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length));
}

export function myWorkView(params: Record<string, string | undefined>) {
  return {
    q: params.workQ?.trim().slice(0, 100) ?? "",
    projectId: params.workProject ?? "",
    labelId: params.workLabel ?? "",
    priority: TASK_PRIORITIES.find((p) => p === params.workPriority) ?? "",
    due: MY_WORK_GROUPS.find((g) => g.key === params.workDue)?.key ?? "",
    sort: params.workSort === "manual" || params.workSort === "priority" ? params.workSort : "due",
  } as const;
}

export function filterMyWork(tasks: MyWorkTask[], view: ReturnType<typeof myWorkView>, today: string): MyWorkTask[] {
  const dueIds = view.due ? new Set(groupMyWork(tasks, today)[view.due].map((t) => t.id)) : null;
  const needle = view.q.toLocaleLowerCase("de");
  return tasks.filter((task) =>
    (!view.projectId || task.projectId === view.projectId) &&
    (!view.labelId || task.labels.some((l) => l.id === view.labelId)) &&
    (!view.priority || task.priority === view.priority) &&
    (!dueIds || dueIds.has(task.id)) &&
    (!needle || `${task.title} ${task.key}-${task.path} ${task.projectName}`.toLocaleLowerCase("de").includes(needle)),
  );
}

/** Buckets open tasks by due date relative to `today` (all YYYY-MM-DD); dated groups sorted by due date. */
export function groupMyWork<T extends { dueDate: string | null }>(tasks: T[], today: string): MyWorkGroups<T> {
  const end = weekEnd(today);
  const groups: MyWorkGroups<T> = { overdue: [], today: [], week: [], later: [], none: [] };
  const sorted = [...tasks].sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  for (const task of sorted) {
    if (!task.dueDate) groups.none.push(task);
    else if (task.dueDate < today) groups.overdue.push(task);
    else if (task.dueDate === today) groups.today.push(task);
    else if (task.dueDate <= end) groups.week.push(task);
    else groups.later.push(task);
  }
  return groups;
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Due date as people say it: "seit 3 Tagen", "Heute", "Morgen", "Fr 9.10." (this week) or the full date. */
export function dueLabel(dueDate: string, today: string): string {
  if (dueDate < today) {
    const days = Math.round((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
    return days === 1 ? "seit gestern" : `seit ${days} Tagen`;
  }
  if (dueDate === today) return "Heute";
  if (dueDate === addDays(today, 1)) return "Morgen";
  if (dueDate <= weekEnd(today)) {
    const [, m, d] = dueDate.split("-").map(Number);
    return `${WEEKDAYS[new Date(`${dueDate}T00:00:00Z`).getUTCDay()]} ${d}.${m}.`;
  }
  return formatDate(dueDate);
}

/** "Guten Morgen" until 11, "Guten Tag" until 18, then "Guten Abend" – by the team's clock. */
export function greeting(hour: number): string {
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}
