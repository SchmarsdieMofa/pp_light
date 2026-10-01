import { z } from "zod";
import { TASK_PRIORITIES, type TaskPriority } from "./enums";
import type { SearchParams } from "./urls";

export type TaskListFilters = {
  statusId?: string;
  assigneeId?: string;
  labelId?: string;
  priority?: TaskPriority;
  q?: string;
};
export const TASK_SORT_FIELDS = ["number", "title", "status", "priority", "dueDate"] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];
/** "position" is internal (board order) and deliberately not accepted from URL params. */
export type TaskSort = { field: TaskSortField | "position"; dir: "asc" | "desc" };

const uuid = z.uuid();

function valid<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/** URL params are user input: anything invalid is dropped, never passed on to SQL. */
export function parseTaskListParams(params: SearchParams): { filters: TaskListFilters; sort: TaskSort } {
  const filters: TaskListFilters = {};
  const statusId = valid(uuid, params.status);
  const assigneeId = valid(uuid, params.assignee);
  const labelId = valid(uuid, params.label);
  const priority = valid(z.enum(TASK_PRIORITIES), params.priority);
  const q = params.q?.trim();
  if (statusId) filters.statusId = statusId;
  if (assigneeId) filters.assigneeId = assigneeId;
  if (labelId) filters.labelId = labelId;
  if (priority) filters.priority = priority;
  if (q) filters.q = q.slice(0, 100);

  return {
    filters,
    sort: {
      field: valid(z.enum(TASK_SORT_FIELDS), params.sort) ?? "number",
      dir: params.dir === "desc" ? "desc" : "asc",
    },
  };
}
