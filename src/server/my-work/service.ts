import { and, asc, desc, eq, exists, isNull, ne, or, sql } from "drizzle-orm";
import type { TaskPriority } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projectMembers, projects, statuses, taskAssignees, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";
import { moveTask } from "@/server/tasks/service";

export type MyWorkTask = {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  number: number;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  statusName: string;
};

/** Open tasks assigned to me in projects I can still see (membership is re-checked, admins see all). */
export function listMyWork(db: DB, actor: Actor): Promise<MyWorkTask[]> {
  const visible =
    actor.role === "admin"
      ? sql`true`
      : exists(
          db
            .select({ one: sql`1` })
            .from(projectMembers)
            .where(and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, actor.id))),
        );
  return db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectName: projects.name,
      key: projects.key,
      number: tasks.number,
      title: tasks.title,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      statusName: statuses.name,
    })
    .from(tasks)
    .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, actor.id)))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(statuses.isDone, false), isNull(projects.archivedAt), or(visible)))
    .orderBy(asc(projects.key), asc(tasks.number));
}

/** Moves a task to the end of its project's first "done" column. */
export async function completeTask(db: DB, actor: Actor, taskId: string): Promise<void> {
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "task.update", projectCtx(role));
  const [done] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.projectId, task.projectId), eq(statuses.isDone, true)))
    .orderBy(byPosition(statuses.position))
    .limit(1);
  if (!done) throw new DomainError("VALIDATION", "Dieses Projekt hat keine Erledigt-Spalte.");
  if (task.statusId === done.id) return;
  const [last] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.statusId, done.id), isNull(tasks.parentId), ne(tasks.id, task.id)))
    .orderBy(desc(byPosition(tasks.position)), desc(tasks.number))
    .limit(1);
  await moveTask(db, actor, task.id, { statusId: done.id, afterId: last?.id ?? null, beforeId: null });
}
