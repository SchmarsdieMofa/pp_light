import { formatDate } from "./dates";
import type { TaskPriority } from "./enums";
import { PRIORITY_LABELS } from "./priority";

export type ActivityLookup = {
  users: Map<string, string>;
  statuses: Map<string, string>;
  phases: Map<string, string>;
  labels: Map<string, string>;
  /** task id → "KEY-n Titel" */
  tasks: Map<string, string>;
};

type Diff = Record<string, unknown>;
type Dates = { startDate?: string | null; dueDate?: string | null };

const GONE = "(gelöscht)";
const name = (map: Map<string, string>, id: unknown) => (typeof id === "string" ? (map.get(id) ?? GONE) : "–");
const date = (value: unknown) => (typeof value === "string" ? formatDate(value) : "–");
const pair = (value: unknown): [unknown, unknown] => (Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]);
const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

function fieldChange(field: string, value: unknown, lookup: ActivityLookup): string | null {
  const [before, after] = pair(value);
  switch (field) {
    case "title":
      return `Titel „${String(before)}“ → „${String(after)}“`;
    case "statusId":
      return `Status ${name(lookup.statuses, before)} → ${name(lookup.statuses, after)}`;
    case "priority":
      return `Priorität ${PRIORITY_LABELS[before as TaskPriority] ?? "–"} → ${PRIORITY_LABELS[after as TaskPriority] ?? "–"}`;
    case "startDate":
      return `Start ${date(before)} → ${date(after)}`;
    case "dueDate":
      return `Fällig ${date(before)} → ${date(after)}`;
    case "phaseId":
      return `Phase ${name(lookup.phases, before)} → ${name(lookup.phases, after)}`;
    case "description":
      return "Beschreibung";
    default:
      return null;
  }
}

function setChange(prefix: string, diff: Diff, map: Map<string, string>): string {
  const parts = [...ids(diff.added).map((id) => `+${name(map, id)}`), ...ids(diff.removed).map((id) => `−${name(map, id)}`)];
  return `${prefix}: ${parts.join(", ")}`;
}

function span(dates: unknown): string {
  const d = (dates ?? {}) as Dates;
  return `${date(d.startDate)}–${date(d.dueDate)}`;
}

/** Human-readable German line for one activity entry; null hides entries that would only repeat others. */
export function describeActivity(action: string, diff: Diff, lookup: ActivityLookup): string | null {
  switch (action) {
    case "task.created":
      return "hat die Aufgabe angelegt";
    case "subtask.created":
      return "hat die Aufgabe als Unteraufgabe angelegt";
    case "task.updated": {
      const parts = Object.entries(diff)
        .map(([field, value]) => fieldChange(field, value, lookup))
        .filter((part): part is string => part !== null);
      return parts.length ? `hat geändert: ${parts.join(" · ")}` : null;
    }
    case "task.moved": {
      const [before, after] = pair(diff.statusId);
      return `hat den Status von ${name(lookup.statuses, before)} auf ${name(lookup.statuses, after)} gesetzt`;
    }
    case "task.autoMoved":
      return `Termin automatisch verschoben: ${span(diff.before)} → ${span(diff.after)}`;
    case "schedule.undone":
      return "hat eine Terminverschiebung rückgängig gemacht";
    case "task.assigneesChanged":
      return setChange("Zuständig", diff, lookup.users);
    case "task.labelsChanged":
      return setChange("Labels", diff, lookup.labels);
    case "dependency.added": {
      const lag = typeof diff.lagDays === "number" && diff.lagDays > 0 ? ` (+${diff.lagDays} Arbeitstage)` : "";
      return `wartet jetzt auf ${name(lookup.tasks, diff.blockerId)}${lag}`;
    }
    case "dependency.updated": {
      const [before, after] = pair(diff.lagDays);
      return `Puffer zu ${name(lookup.tasks, diff.blockerId)}: ${String(before)} → ${String(after)} Arbeitstage`;
    }
    case "dependency.removed":
      return `wartet nicht mehr auf ${name(lookup.tasks, diff.blockerId)}`;
    case "comment.added":
      return "hat kommentiert";
    case "attachment.added":
      return `hat „${String(diff.filename)}“ angehängt`;
    case "attachment.removed":
      return `hat „${String(diff.filename)}“ entfernt`;
    default:
      // schedule.changed duplicates the date fields of task.updated; unknown actions stay hidden.
      return null;
  }
}
