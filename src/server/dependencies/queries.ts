import { and, eq, inArray, or } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { taskDependencies, tasks } from "@/server/db/schema";

export type TaskLink = { id: string; number: number; title: string; lagDays: number };

export async function listTaskLinks(ex: Executor, projectId: string, taskId: string): Promise<{ blockers: TaskLink[]; successors: TaskLink[] }> {
  const edges = await ex.select().from(taskDependencies).where(or(
    eq(taskDependencies.blockerId, taskId), eq(taskDependencies.blockedId, taskId),
  ));
  if (edges.length === 0) return { blockers: [], successors: [] };
  const linkedIds = edges.map((edge) => edge.blockerId === taskId ? edge.blockedId : edge.blockerId);
  const linked = await ex.select({ id: tasks.id, number: tasks.number, title: tasks.title }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), inArray(tasks.id, linkedIds)));
  const byId = new Map(linked.map((task) => [task.id, task]));
  const asLink = (id: string, lagDays: number): TaskLink | null => {
    const task = byId.get(id);
    return task ? { ...task, lagDays } : null;
  };
  return {
    blockers: edges.filter((edge) => edge.blockedId === taskId)
      .map((edge) => asLink(edge.blockerId, edge.lagDays)).filter((item): item is TaskLink => item !== null),
    successors: edges.filter((edge) => edge.blockerId === taskId)
      .map((edge) => asLink(edge.blockedId, edge.lagDays)).filter((item): item is TaskLink => item !== null),
  };
}
