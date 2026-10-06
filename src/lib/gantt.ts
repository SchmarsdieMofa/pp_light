import type { GanttEvent, GanttResource } from "@/components/reui/gantt/gantt-types";
import { earliestStart } from "@/lib/business-days";
import type { GanttData, GanttTask } from "@/server/gantt/queries";

export function chartDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function exclusiveEnd(dueDate: string): Date {
  const end = chartDate(dueDate);
  end.setDate(end.getDate() + 1);
  return end;
}

export function inclusiveDue(end: Date): string {
  const due = new Date(end);
  due.setDate(due.getDate() - 1);
  return isoDate(due);
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function isScheduled(task: GanttTask): task is GanttTask & { startDate: string; dueDate: string } {
  return !!task.startDate && !!task.dueDate;
}

function bounds(tasks: GanttTask[], fallbackStart: string | null, fallbackEnd: string | null) {
  const starts = tasks.flatMap((task) => task.startDate ? [task.startDate] : []);
  const ends = tasks.flatMap((task) => task.dueDate ? [task.dueDate] : []);
  const start = starts.length ? starts.sort()[0] : fallbackStart;
  const end = ends.length ? ends.sort().at(-1)! : fallbackEnd;
  return start && end ? { start: chartDate(start), end: exclusiveEnd(end) } : null;
}

export function earlierStartIds(data: GanttData): Set<string> {
  const byId = new Map(data.tasks.map((task) => [task.id, task]));
  const required = new Map<string, string>();
  for (const link of data.links) {
    const due = byId.get(link.blockerId)?.dueDate;
    if (!due) continue;
    const candidate = earliestStart(due, link.lagDays);
    const previous = required.get(link.blockedId);
    if (!previous || candidate > previous) required.set(link.blockedId, candidate);
  }
  return new Set(data.tasks.filter((task) => {
    const earliest = required.get(task.id);
    return earliest && task.startDate && task.startDate > earliest && !task.isDone;
  }).map((task) => task.id));
}

/** What the tree columns show next to a row's name. Only task rows carry dates and hints. */
export type RowInfo = { kind: "phase" | "milestone" | "task"; startLabel: string; dueLabel: string; hint: string };

export type BarData = { kind: "phase" | "milestone" | "task" };

export type ChartData = {
  /** Phases are groups, tasks rows inside them; a task with dated subtasks is a group of its own. */
  resources: GanttResource[];
  /** One bar per row; ids of task bars are task ids. */
  events: GanttEvent<BarData>[];
  rows: Map<string, RowInfo>;
  unscheduled: GanttTask[];
};

const phaseColor = "var(--color-slate-400)";
const milestoneColor = "var(--color-amber-500)";
const doneColor = "var(--color-emerald-500)";
const taskColor = "var(--color-blue-500)";

export function toChartData(data: GanttData, key: string): ChartData {
  const scheduled = data.tasks.filter(isScheduled);
  const earlier = earlierStartIds(data);
  const scheduledIds = new Set(scheduled.map((task) => task.id));
  const effectivePhase = new Map(data.tasks.map((task) => [task.id, task.phaseId]));
  for (const task of data.tasks) {
    if (!task.phaseId && task.parentId) effectivePhase.set(task.id, effectivePhase.get(task.parentId) ?? null);
  }
  const blockers = new Map<string, string[]>();
  for (const link of data.links) {
    if (!scheduledIds.has(link.blockerId) || !scheduledIds.has(link.blockedId)) continue;
    blockers.set(link.blockedId, [...(blockers.get(link.blockedId) ?? []), link.blockerId]);
  }
  const events: GanttEvent<BarData>[] = [];
  const rows = new Map<string, RowInfo>();
  const blank = { startLabel: "", dueLabel: "", hint: "" };

  // Subtasks hang below their parent when both are dated and share the phase; otherwise below the phase.
  const taskNodes = (phaseId: string | null): GanttResource[] => {
    const members = scheduled.filter((task) => effectivePhase.get(task.id) === phaseId);
    const memberIds = new Set(members.map((task) => task.id));
    const childrenOf = (parentId: string | null): GanttResource[] => members
      .filter((task) => (task.parentId && memberIds.has(task.parentId) ? task.parentId : null) === parentId)
      .map((task) => {
        const title = `${key}-${task.path} ${task.title}`;
        events.push({
          id: task.id,
          title,
          start: chartDate(task.startDate),
          end: exclusiveEnd(task.dueDate),
          allDay: true,
          resourceId: task.id,
          color: task.isDone ? doneColor : taskColor,
          progress: task.isDone ? 100 : undefined,
          dependencies: blockers.get(task.id),
          data: { kind: "task" },
        });
        rows.set(task.id, {
          kind: "task",
          startLabel: displayDate(task.startDate),
          dueLabel: displayDate(task.dueDate),
          hint: earlier.has(task.id) ? "Könnte früher starten" : "",
        });
        const children = childrenOf(task.id);
        return children.length ? { id: task.id, title, children } : { id: task.id, title };
      });
    return childrenOf(null);
  };

  const milestone = (id: string, name: string, date: string) => {
    const day = chartDate(date);
    events.push({ id, title: name, start: day, end: day, allDay: true, resourceId: id, color: milestoneColor,
      readOnly: true, data: { kind: "milestone" } });
    rows.set(id, { kind: "milestone", ...blank, startLabel: displayDate(date) });
  };

  const resources: GanttResource[] = [];
  for (const phase of data.phases) {
    const id = `phase:${phase.id}`;
    const children = taskNodes(phase.id);
    if (children.length === 0) {
      // A phase without dated tasks shows its own planned window (or its milestone day) as one row.
      if (phase.isMilestone && phase.startDate) {
        milestone(id, phase.name, phase.startDate);
        resources.push({ id, title: phase.name });
        continue;
      }
      const interval = bounds([], phase.startDate, phase.endDate);
      if (!interval) continue;
      events.push({ id, title: phase.name, ...interval, allDay: true, resourceId: id, color: phaseColor, readOnly: true,
        data: { kind: "phase" } });
      rows.set(id, { kind: "phase", ...blank, startLabel: displayDate(phase.startDate!), dueLabel: displayDate(phase.endDate!) });
      resources.push({ id, title: phase.name });
      continue;
    }
    rows.set(id, { kind: "phase", ...blank });
    if (phase.isMilestone && phase.startDate) {
      milestone(`milestone:${phase.id}`, phase.name, phase.startDate);
      children.unshift({ id: `milestone:${phase.id}`, title: phase.name });
    }
    resources.push({ id, title: phase.name, children });
  }
  const unassigned = taskNodes(null);
  if (unassigned.length > 0) {
    rows.set("phase:unassigned", { kind: "phase", ...blank });
    resources.push({ id: "phase:unassigned", title: "Ohne Phase", children: unassigned });
  }
  return { resources, events, rows, unscheduled: data.tasks.filter((task) => !isScheduled(task)) };
}

/** Where the chart opens: today if it lies within the plan, else the first planned day. */
export function initialDate(events: { start: Date; end: Date }[], now: Date = new Date()): Date {
  if (events.length === 0) return now;
  const first = Math.min(...events.map((event) => event.start.getTime()));
  const last = Math.max(...events.map((event) => event.end.getTime()));
  return now.getTime() >= first && now.getTime() <= last ? now : new Date(first);
}
