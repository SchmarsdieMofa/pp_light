import { MAX_TASK_DEPTH, taskDepth } from "@/lib/task-path";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { and, asc, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import {
  createTaskSchema,
  moveTaskSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type MoveTaskInput,
  type TaskPatch,
} from "@/lib/schemas/task";
import { recordActivity } from "@/server/activity/service";
import { storagePath } from "@/server/attachments/service";
import { propagateDates } from "@/server/dependencies/scheduling";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { attachments, phases, projects, statuses, tasks } from "@/server/db/schema";
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

async function firstPosition(ex: Executor, statusId: string): Promise<string> {
  const [first] = await ex
    .select({ position: tasks.position })
    .from(tasks)
    .where(eq(tasks.statusId, statusId))
    .orderBy(byPosition(tasks.position))
    .limit(1);
  return generateKeyBetween(null, first?.position ?? null);
}

export async function createTask(db: DB, actor: Actor, raw: CreateTaskInput): Promise<Task> {
  const input = createTaskSchema.parse(raw);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "task.create", projectCtx(access.role));

  return db.transaction(async (tx) => {
    // Top-level tasks count up per project; a subtask counts up among its siblings and extends the parent's path.
    // The row lock (project or parent) serializes concurrent creations → unique, gapless numbers.
    let number: number;
    let path: string;
    if (input.parentId) {
      // Same lock order as update, move and delete (project first, then task rows): the inserts below take a
      // KEY SHARE on the project row, which would otherwise deadlock against a delete holding the project lock.
      await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).for("update");
      const [parent] = await tx.select().from(tasks).where(eq(tasks.id, input.parentId)).limit(1).for("update");
      if (!parent || parent.projectId !== input.projectId) {
        throw new DomainError("VALIDATION", "Übergeordnete Aufgabe nicht gefunden.");
      }
      if (taskDepth(parent.path) >= MAX_TASK_DEPTH) {
        throw new DomainError("VALIDATION", `Unteraufgaben lassen sich höchstens ${MAX_TASK_DEPTH - 1} Ebenen tief verschachteln.`);
      }
      // A counter instead of max(number)+1: after a delete the highest number would be handed out again.
      const [{ subtaskCounter }] = await tx
        .update(tasks)
        .set({ subtaskCounter: sql`${tasks.subtaskCounter} + 1` })
        .where(eq(tasks.id, parent.id))
        .returning({ subtaskCounter: tasks.subtaskCounter });
      number = subtaskCounter;
      path = `${parent.path}.${number}`;
    } else {
      const [{ taskCounter }] = await tx
        .update(projects)
        .set({ taskCounter: sql`${projects.taskCounter} + 1` })
        .where(eq(projects.id, input.projectId))
        .returning({ taskCounter: projects.taskCounter });
      number = taskCounter;
      path = String(taskCounter);
    }
    const status = await resolveStatus(tx, input.projectId, input.statusId);

    const [task] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        number,
        path,
        title: input.title,
        statusId: status.id,
        position: input.placement === "top" ? await firstPosition(tx, status.id) : await nextPosition(tx, status.id),
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

const EDITABLE_FIELDS = ["title", "description", "statusId", "phaseId", "priority", "startDate", "dueDate"] as const;

export async function updateTask(
  db: DB,
  actor: Actor,
  taskId: string,
  expectedUpdatedAt: string,
  rawPatch: TaskPatch,
): Promise<Task & { schedule?: { movedCount: number; groupId: string } }> {
  const patch = updateTaskSchema.parse(rawPatch);

  return db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, task.projectId)).for("update");
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
    if (changes.phaseId) {
      const [phase] = await tx.select({ id: phases.id }).from(phases)
        .where(and(eq(phases.id, changes.phaseId), eq(phases.projectId, task.projectId))).limit(1);
      if (!phase) throw new DomainError("VALIDATION", "Unbekannte Phase.");
    }

    // Optimistic lock: a concurrent writer that committed first makes this match zero rows.
    const [updated] = await tx
      .update(tasks)
      .set({ ...changes, updatedAt: sql`greatest(now(), ${tasks.updatedAt} + interval '1 millisecond')` })
      .where(and(eq(tasks.id, taskId), eq(tasks.updatedAt, task.updatedAt)))
      .returning();
    if (!updated) throw new DomainError("CONFLICT", "Die Aufgabe wurde zwischenzeitlich geändert.");

    const datesChanged = changes.startDate !== undefined || changes.dueDate !== undefined;
    const groupId = datesChanged ? randomUUID() : null;
    if (groupId) {
      await recordActivity(tx, {
        projectId: task.projectId, taskId: task.id, actorId: actor.id,
        action: "schedule.changed", groupId,
        diff: {
          before: { startDate: task.startDate, dueDate: task.dueDate },
          after: { startDate: updated.startDate, dueDate: updated.dueDate },
        },
      });
    }
    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "task.updated",
      diff,
      groupId,
    });
    if (!groupId) return updated;
    const movedCount = await propagateDates(tx, task.projectId, [task.id], false, actor.id, groupId);
    return { ...updated, schedule: { movedCount, groupId } };
  });
}

const staleBoard = () => new DomainError("CONFLICT", "Das Board hat sich geändert – bitte neu laden.");

/** Renumbers a column (in its current visual order) when stored keys collide or are out of order. */
async function rebalanceColumn(ex: Executor, statusId: string, excludeId: string): Promise<void> {
  const rows = await ex
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.statusId, statusId), isNull(tasks.parentId), ne(tasks.id, excludeId)))
    .orderBy(byPosition(tasks.position), asc(tasks.number));
  const keys = generateNKeysBetween(null, null, rows.length);
  for (const [i, row] of rows.entries()) {
    await ex.update(tasks).set({ position: keys[i] }).where(eq(tasks.id, row.id));
  }
}

export async function moveTask(db: DB, actor: Actor, taskId: string, raw: MoveTaskInput): Promise<Task> {
  const input = moveTaskSchema.parse(raw);
  if (input.afterId === taskId || input.beforeId === taskId) {
    throw new DomainError("VALIDATION", "Eine Karte kann nicht neben sich selbst liegen.");
  }

  return db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.update", projectCtx(role));
    // One move per project at a time: keeps neighbour reads and the rebalance consistent.
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, task.projectId)).for("update");
    const status = await resolveStatus(tx, task.projectId, input.statusId);

    const loadNeighbour = async (id: string | null) => {
      if (!id) return null;
      const [n] = await tx
        .select({ id: tasks.id, position: tasks.position, statusId: tasks.statusId })
        .from(tasks)
        .where(eq(tasks.id, id))
        .limit(1);
      if (!n || n.statusId !== status.id) throw staleBoard();
      return n;
    };
    let after = await loadNeighbour(input.afterId);
    let before = await loadNeighbour(input.beforeId);
    if (after && before && after.position >= before.position) {
      await rebalanceColumn(tx, status.id, task.id);
      after = await loadNeighbour(input.afterId);
      before = await loadNeighbour(input.beforeId);
      if (after && before && after.position >= before.position) throw staleBoard();
    }
    const position = generateKeyBetween(after?.position ?? null, before?.position ?? null);

    const statusChanged = status.id !== task.statusId;
    const [updated] = await tx
      .update(tasks)
      .set(
        statusChanged
          ? {
              statusId: status.id,
              position,
              completedAt: status.isDone ? (task.completedAt ?? new Date()) : null,
              updatedAt: sql`now()`,
            }
          : { position },
      )
      .where(eq(tasks.id, task.id))
      .returning();

    if (statusChanged) {
      await recordActivity(tx, {
        projectId: task.projectId,
        taskId: task.id,
        actorId: actor.id,
        action: "task.moved",
        diff: { statusId: [task.statusId, status.id] },
      });
    }
    return updated;
  });
}

/**
 * Deletes the task with everything under it: subtasks, comments, checklist, links and attachments (rows and files).
 * Gone for good. A "task.deleted" line (without a task reference) is written for the audit trail; nothing shows it yet.
 * Returns how many tasks went (the task and its subtasks).
 */
export async function deleteTask(db: DB, actor: Actor, taskId: string, uploadDir: string): Promise<{ deleted: number }> {
  const { deleted, storageKeys } = await db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId);
    assertCan(actor, "task.delete", projectCtx(role));
    // Same lock as every other write to the project's tasks: a move or edit in flight finishes first.
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, task.projectId)).for("update");

    // Subtask paths extend the parent's ("3" → "3.1" → "3.1.2") and never change.
    const family = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, task.projectId), or(eq(tasks.id, task.id), like(tasks.path, `${task.path}.%`))))
      .for("update");
    const ids = family.map((row) => row.id);
    // A concurrent delete of the same task finished while this one waited for the project lock.
    if (!ids.includes(task.id)) throw new DomainError("NOT_FOUND", "Aufgabe nicht gefunden.");
    const files = await tx.select({ storageKey: attachments.storageKey }).from(attachments).where(inArray(attachments.taskId, ids));

    // Foreign keys cascade to subtasks, comments, checklist, assignees, labels, links, attachments and the task's activity.
    await tx.delete(tasks).where(eq(tasks.id, task.id));
    await recordActivity(tx, {
      projectId: task.projectId,
      taskId: null,
      actorId: actor.id,
      action: "task.deleted",
      diff: { path: task.path, title: task.title, subtasks: ids.length - 1 },
    });
    return { deleted: ids.length, storageKeys: files.map((file) => file.storageKey) };
  });
  // Rows are gone; the files follow. A file that cannot be removed is logged, not thrown: the delete has happened.
  const results = await Promise.allSettled(storageKeys.map(async (key) => rm(storagePath(uploadDir, key), { force: true })));
  for (const result of results) {
    if (result.status === "rejected") console.error("Anhang-Datei konnte nicht gelöscht werden", result.reason);
  }
  return { deleted };
}
