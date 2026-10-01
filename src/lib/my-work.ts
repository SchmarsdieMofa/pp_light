import { weekEnd } from "./dates";

export type MyWorkGroups<T> = { overdue: T[]; today: T[]; week: T[]; later: T[]; none: T[] };

export const MY_WORK_GROUPS = [
  { key: "overdue", label: "Überfällig" },
  { key: "today", label: "Heute" },
  { key: "week", label: "Diese Woche" },
  { key: "later", label: "Später" },
  { key: "none", label: "Ohne Termin" },
] as const;

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
