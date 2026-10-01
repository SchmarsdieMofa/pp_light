import type { ILink, ITask } from "@svar-ui/react-gantt";
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

export type ChartData = { tasks: ITask[]; links: ILink[]; unscheduled: GanttTask[] };

export function toChartData(data: GanttData, key: string, collapsed: ReadonlySet<string> = new Set()): ChartData {
  const scheduled = data.tasks.filter(isScheduled);
  const earlier = earlierStartIds(data);
  const scheduledIds = new Set(scheduled.map((task) => task.id));
  const effectivePhase = new Map(data.tasks.map((task) => [task.id, task.phaseId]));
  for (const task of data.tasks) {
    if (!task.phaseId && task.parentId) effectivePhase.set(task.id, effectivePhase.get(task.parentId) ?? null);
  }
  const result: ITask[] = [];
  const addTasks = (phaseId: string | null, parent: string | number) => {
    for (const task of scheduled) {
      if (effectivePhase.get(task.id) !== phaseId) continue;
      const parentId = task.parentId && scheduledIds.has(task.parentId)
        && effectivePhase.get(task.parentId) === phaseId ? task.parentId : parent;
      result.push({
        id: task.id,
        parent: parentId,
        text: `${key}-${task.number} ${task.title}`,
        start: chartDate(task.startDate),
        end: exclusiveEnd(task.dueDate),
        type: "task",
        progress: task.isDone ? 100 : 0,
        startLabel: displayDate(task.startDate),
        dueLabel: displayDate(task.dueDate),
        hint: earlier.has(task.id) ? "Könnte früher starten" : "",
      });
    }
  };

  for (const phase of data.phases) {
    const members = scheduled.filter((task) => effectivePhase.get(task.id) === phase.id);
    if (phase.isMilestone && members.length === 0 && phase.startDate) {
      result.push({ id: `phase:${phase.id}`, text: phase.name, type: "milestone", start: chartDate(phase.startDate) });
      continue;
    }
    const interval = bounds(members, phase.startDate, phase.endDate);
    if (!interval) continue;
    result.push({ id: `phase:${phase.id}`, text: phase.name, type: "summary", open: !collapsed.has(`phase:${phase.id}`), ...interval });
    if (phase.isMilestone && phase.startDate) {
      result.push({ id: `milestone:${phase.id}`, parent: `phase:${phase.id}`, text: phase.name,
        type: "milestone", start: chartDate(phase.startDate) });
    }
    addTasks(phase.id, `phase:${phase.id}`);
  }
  const unassigned = scheduled.filter((task) => !effectivePhase.get(task.id));
  if (unassigned.length > 0) {
    const interval = bounds(unassigned, null, null)!;
    result.push({ id: "phase:unassigned", text: "Ohne Phase", type: "summary", open: !collapsed.has("phase:unassigned"), ...interval });
    addTasks(null, "phase:unassigned");
  }
  return {
    tasks: result,
    links: data.links.filter((link) => scheduledIds.has(link.blockerId) && scheduledIds.has(link.blockedId))
      .map((link) => ({ id: `${link.blockerId}:${link.blockedId}`, source: link.blockerId,
        target: link.blockedId, type: "e2s" })),
    unscheduled: data.tasks.filter((task) => !isScheduled(task)),
  };
}
