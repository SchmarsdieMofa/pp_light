import type { TaskPriority } from "./enums";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: "Keine",
  low: "Niedrig",
  med: "Mittel",
  high: "Hoch",
  urgent: "Dringend",
};
