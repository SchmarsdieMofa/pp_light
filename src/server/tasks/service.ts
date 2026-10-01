import { and, desc, eq, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { createTaskSchema, type CreateTaskInput } from "@/lib/schemas/task";
import { recordActivity } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projects, statuses, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import type { Task } from "./access";

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
