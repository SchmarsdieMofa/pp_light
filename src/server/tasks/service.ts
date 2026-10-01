import { and, desc, eq, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { createTaskSchema, updateTaskSchema, type CreateTaskInput, type TaskPatch } from "@/lib/schemas/task";
import { recordActivity } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projects, statuses, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import { loadTaskAccess, type Task } from "./access";

async function resolveStatus(ex: Executor, projectId: string, statusId?: string) {
  if (statusId) {
    const [status] = await ex
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)))
      .limit(1);
    if (!status) throw new DomainError("VALIDATION", "Unbekannter Status.");
    return status;
  }
  const [first] = await ex
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(byPosition(statuses.position))
    .limit(1);
  if (!first) throw new DomainError("VALIDATION", "Das Projekt hat keine Status-Spalten.");
  return first;
}

async function nextPosition(ex: Executor, statusId: string): Promise<string> {
  const [last] = await ex
    .select({ position: tasks.position })
    .from(tasks)
    .where(eq(tasks.statusId, statusId))
    .orderBy(desc(byPosition(tasks.position)))
    .limit(1);
  return generateKeyBetween(last?.position ?? null, null);
}

export async function createTask(db: DB, actor: Actor, raw: CreateTaskInput): Promise<Task> {
  const input = createTaskSchema.parse(raw);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "task.create", projectCtx(access.role));

  return db.transaction(async (tx) => {
    if (input.parentId) {
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, input.parentId)).limit(1);
      if (!parent || parent.projectId !== input.projectId) {
        throw new DomainError("VALIDATION", "Übergeordnete Aufgabe nicht gefunden.");
      }
      if (parent.parentId) {
        throw new DomainError("VALIDATION", "Unteraufgaben können keine eigenen Unteraufgaben haben.");
      }
    }
    const status = await resolveStatus(tx, input.projectId, input.statusId);
    // Row lock on the project serializes concurrent creations → unique, gapless numbers.
    const [{ taskCounter }] = await tx
      .update(projects)
      .set({ taskCounter: sql`${projects.taskCounter} + 1` })
      .where(eq(projects.id, input.projectId))
      .returning({ taskCounter: projects.taskCounter });

    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        number: taskCounter,
        title: input.title,
        statusId: status.id,
        position: await nextPosition(tx, status.id),
        createdBy: actor.id,
        completedAt: status.isDone ? new Date() : null,
      })
      .returning();

    await recordActivity(tx, {
      projectId: input.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: input.parentId ? "subtask.created" : "task.created",
      diff: { title: task.title, parentId: task.parentId },
    });
    return task;
  });
}

const EDITABLE_FIELDS = ["title", "description", "statusId", "priority", "startDate", "dueDate"] as const;

export async function updateTask(
  db: DB,
  actor: Actor,
  taskId: string,
  expectedUpdatedAt: string,
  rawPatch: TaskPatch,
): Promise<Task> {
  const patch = updateTaskSchema.parse(rawPatch);

  return db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    if (task.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
      throw new DomainError("CONFLICT", "Die Aufgabe wurde zwischenzeitlich geändert.");
    }

    const changes: Partial<typeof tasks.$inferInsert> = {};
    const diff: Record<string, [unknown, unknown]> = {};
    for (const field of EDITABLE_FIELDS) {
      const next = patch[field];
      if (next !== undefined && next !== task[field]) {
        Object.assign(changes, { [field]: next });
        diff[field] = [task[field], next];
      }
    }
    if (Object.keys(diff).length === 0) return task;

    const startDate = changes.startDate !== undefined ? changes.startDate : task.startDate;
    const dueDate = changes.dueDate !== undefined ? changes.dueDate : task.dueDate;
    if (startDate && dueDate && startDate > dueDate) {
      throw new DomainError("VALIDATION", "Der Start liegt nach dem Fälligkeitsdatum.");
    }
    if (changes.statusId) {
      const status = await resolveStatus(tx, task.projectId, changes.statusId);
      changes.completedAt = status.isDone ? (task.completedAt ?? new Date()) : null;
    }

    // Optimistic lock: a concurrent writer that committed first makes this match zero rows.
    const [updated] = await tx
      .update(tasks)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(and(eq(tasks.id, taskId), eq(tasks.updatedAt, task.updatedAt)))
      .returning();
    if (!updated) throw new DomainError("CONFLICT", "Die Aufgabe wurde zwischenzeitlich geändert.");

    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "task.updated",
      diff,
    });
    return updated;
  });
}
