import { addDays, formatDate, weekEnd } from "./dates";

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
