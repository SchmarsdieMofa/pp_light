import { eq, inArray, sql } from "drizzle-orm";
import { businessDaysInclusive, earliestStart, endForStart } from "@/lib/business-days";
import { topologicalOrder } from "@/lib/dependency-graph";
import { recordActivity } from "@/server/activity/service";
import type { Executor } from "@/server/db/client";
import { statuses, taskDependencies, tasks } from "@/server/db/schema";

type Dates = { startDate: string | null; dueDate: string | null };
export type ScheduleMove = { id: string; before: Dates; after: Dates };

export async function propagateDates(
  ex: Executor,
  projectId: string,
  roots: string[],
  includeRoots: boolean,
  actorId: string,
  groupId: string,
  /** Receives every move, e.g. to preview them before they are kept. */
  collect?: ScheduleMove[],
): Promise<number> {
  const rows = await ex.select({
    id: tasks.id,
    startDate: tasks.startDate,
    dueDate: tasks.dueDate,
    isDone: statuses.isDone,
  }).from(tasks).innerJoin(statuses, eq(statuses.id, tasks.statusId)).where(eq(tasks.projectId, projectId));
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);
  const dependencies = await ex.select().from(taskDependencies).where(inArray(taskDependencies.blockerId, ids));
  const idSet = new Set(ids);
  const edges = dependencies.filter((edge) => idSet.has(edge.blockedId));
  const order = topologicalOrder(ids, edges);
  const successors = new Map<string, string[]>();
  const blockers = new Map<string, typeof edges>();
  for (const edge of edges) {
    successors.set(edge.blockerId, [...(successors.get(edge.blockerId) ?? []), edge.blockedId]);
    blockers.set(edge.blockedId, [...(blockers.get(edge.blockedId) ?? []), edge]);
  }
  const affected = new Set(includeRoots ? roots : []);
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop()!;
    for (const next of successors.get(id) ?? []) {
      if (affected.has(next)) continue;
      affected.add(next);
      pending.push(next);
    }
  }
  const current = new Map(rows.map((row) => [row.id, row]));
  let moved = 0;
  for (const id of order) {
    if (!affected.has(id)) continue;
    const row = current.get(id)!;
    if (row.isDone || !row.startDate || !row.dueDate) continue;
    let required: string | null = null;
    for (const edge of blockers.get(id) ?? []) {
      const due = current.get(edge.blockerId)?.dueDate;
      if (!due) continue;
      const candidate = earliestStart(due, edge.lagDays);
      if (!required || candidate > required) required = candidate;
    }
    if (!required || required <= row.startDate) continue;
    const before: Dates = { startDate: row.startDate, dueDate: row.dueDate };
    const after: Dates = {
      startDate: required,
      dueDate: endForStart(required, businessDaysInclusive(row.startDate, row.dueDate)),
    };
    await ex.update(tasks).set({
      ...after,
      updatedAt: sql`greatest(now(), ${tasks.updatedAt} + interval '1 millisecond')`,
    }).where(eq(tasks.id, id));
    await recordActivity(ex, {
      projectId, taskId: id, actorId, action: "task.autoMoved", groupId,
      diff: { before, after },
    });
    current.set(id, { ...row, ...after });
    collect?.push({ id, before, after });
    moved++;
  }
  return moved;
}
