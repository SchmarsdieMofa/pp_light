import { and, asc, desc, eq, exists, isNull, ne, or, sql } from "drizzle-orm";
import type { TaskPriority } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { byPosition, byPath } from "@/server/db/order";
import { projectMembers, projects, statuses, taskAssignees, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";
import { setTaskAssignees } from "@/server/tasks/relations";
import { createTask, moveTask, updateTask } from "@/server/tasks/service";

export type MyWorkTask = {
  id: string;
  projectId: string;
  projectName: string;
  key: string;
  path: string;
  title: string;
  dueDate: string | null;
  priority: TaskPriority;
  statusName: string;
  /** For optimistic-lock saves (reschedule from the list). */
  updatedAt: string;
};

/** Open tasks assigned to me in projects I can still see (membership is re-checked, admins get no special access). */
export async function listMyWork(db: DB, actor: Actor): Promise<MyWorkTask[]> {
  const visible = exists(
    db
      .select({ one: sql`1` })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, actor.id))),
  );
  const rows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectName: projects.name,
      key: projects.key,
      path: tasks.path,
      title: tasks.title,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      statusName: statuses.name,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(taskAssignees, and(eq(taskAssignees.taskId, tasks.id), eq(taskAssignees.userId, actor.id)))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(statuses.isDone, false), isNull(projects.archivedAt), or(visible)))
    .orderBy(asc(projects.key), asc(byPath(tasks.path)));
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

/** Quick capture from the home page: a task assigned to the actor, optionally with a due date. */
export async function createMyTask(
  db: DB,
  actor: Actor,
  input: { projectId: string; title: string; dueDate: string | null },
): Promise<{ id: string; path: string }> {
  // Check first: creating the task and then failing to assign it would leave an orphan behind.
  const [membership] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, actor.id)))
    .limit(1);
  if (!membership || membership.role === "guest") {
    throw new DomainError("VALIDATION", "Hier kannst du dir keine Aufgaben zuweisen – du bist kein Mitglied dieses Projekts.");
  }
  const task = await createTask(db, actor, { projectId: input.projectId, title: input.title });
  await setTaskAssignees(db, actor, task.id, [actor.id]);
  if (input.dueDate) await updateTask(db, actor, task.id, task.updatedAt.toISOString(), { dueDate: input.dueDate });
  return { id: task.id, path: task.path };
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

/** Moves a done task back to the end of its project's first open column. */
export async function reopenTask(db: DB, actor: Actor, taskId: string): Promise<void> {
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "task.update", projectCtx(role));
  const [open] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.projectId, task.projectId), eq(statuses.isDone, false)))
    .orderBy(byPosition(statuses.position))
    .limit(1);
  if (!open) throw new DomainError("VALIDATION", "Dieses Projekt hat keine offene Spalte.");
  if (task.statusId === open.id) return;
  const [last] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.statusId, open.id), isNull(tasks.parentId), ne(tasks.id, task.id)))
    .orderBy(desc(byPosition(tasks.position)), desc(tasks.number))
    .limit(1);
  await moveTask(db, actor, task.id, { statusId: open.id, afterId: last?.id ?? null, beforeId: null });
}

/**
 * Active projects where the actor can capture a task for themselves: they must be an owner or member,
 * because only members can be assignees – admins without membership included.
 */
export async function listCapturableProjects(db: DB, actor: Actor): Promise<{ id: string; name: string; key: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name, key: projects.key })
    .from(projects)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(and(isNull(projects.archivedAt), ne(projectMembers.role, "guest")))
    .orderBy(asc(projects.name));
}
