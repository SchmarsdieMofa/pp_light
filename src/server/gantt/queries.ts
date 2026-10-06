import { asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { phases, statuses, taskDependencies, tasks } from "@/server/db/schema";
import { byPosition, byPath } from "@/server/db/order";

export type GanttPhase = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isMilestone: boolean;
};

export type GanttTask = {
  id: string;
  parentId: string | null;
  phaseId: string | null;
  path: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  updatedAt: string;
  isDone: boolean;
};

export type GanttLink = { blockerId: string; blockedId: string; lagDays: number };
export type GanttData = { phases: GanttPhase[]; tasks: GanttTask[]; links: GanttLink[] };

export async function getGanttData(db: DB, projectId: string): Promise<GanttData> {
  const [phaseRows, taskRows] = await Promise.all([
    db.select({
      id: phases.id,
      name: phases.name,
      startDate: phases.startDate,
      endDate: phases.endDate,
      isMilestone: phases.isMilestone,
    }).from(phases).where(eq(phases.projectId, projectId)).orderBy(byPosition(phases.position)),
    db.select({
      id: tasks.id,
      parentId: tasks.parentId,
      phaseId: tasks.phaseId,
      path: tasks.path,
      title: tasks.title,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      updatedAt: tasks.updatedAt,
      isDone: statuses.isDone,
    }).from(tasks).innerJoin(statuses, eq(tasks.statusId, statuses.id))
      .where(eq(tasks.projectId, projectId)).orderBy(asc(byPath(tasks.path))),
  ]);
  const ids = taskRows.map((task) => task.id);
  const links = ids.length === 0 ? [] : await db.select({
    blockerId: taskDependencies.blockerId,
    blockedId: taskDependencies.blockedId,
    lagDays: taskDependencies.lagDays,
  }).from(taskDependencies).where(inArray(taskDependencies.blockerId, ids));
  const idSet = new Set(ids);
  return {
    phases: phaseRows,
    tasks: taskRows.map(({ updatedAt, ...task }) => ({ ...task, updatedAt: updatedAt.toISOString() })),
    links: links.filter((link) => idSet.has(link.blockedId)),
  };
}
