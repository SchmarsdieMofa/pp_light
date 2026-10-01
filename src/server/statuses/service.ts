import { and, desc, eq, ne, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { statusSchema, type StatusInput } from "@/lib/schemas/task";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { statuses, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { listStatuses, requireProjectAccess, type Status } from "@/server/projects/service";

async function requireManage(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
}

async function loadStatus(db: DB, statusId: string): Promise<Status> {
  const notFound = new DomainError("NOT_FOUND", "Spalte nicht gefunden.");
  if (!z.uuid().safeParse(statusId).success) throw notFound;
  const [status] = await db.select().from(statuses).where(eq(statuses.id, statusId)).limit(1);
  if (!status) throw notFound;
  return status;
}

async function assertUniqueName(ex: Executor, projectId: string, name: string, exceptId?: string) {
  const [clash] = await ex
    .select({ id: statuses.id })
    .from(statuses)
    .where(
      and(
        eq(statuses.projectId, projectId),
        sql`lower(${statuses.name}) = lower(${name})`,
        exceptId ? ne(statuses.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw new DomainError("VALIDATION", "Diese Spalte gibt es schon.");
}

export async function createStatus(db: DB, actor: Actor, projectId: string, raw: StatusInput): Promise<Status> {
  const input = statusSchema.parse(raw);
  await requireManage(db, actor, projectId);
  await assertUniqueName(db, projectId, input.name);
  const [last] = await db
    .select({ position: statuses.position })
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(desc(byPosition(statuses.position)))
    .limit(1);
  const [status] = await db
    .insert(statuses)
    .values({ projectId, ...input, position: generateKeyBetween(last?.position ?? null, null) })
    .returning();
  return status;
}

export async function updateStatus(db: DB, actor: Actor, statusId: string, raw: StatusInput): Promise<void> {
  const input = statusSchema.parse(raw);
  const status = await loadStatus(db, statusId);
  await requireManage(db, actor, status.projectId);
  await assertUniqueName(db, status.projectId, input.name, status.id);
  await db.update(statuses).set(input).where(eq(statuses.id, status.id));
}

export async function moveStatus(db: DB, actor: Actor, statusId: string, direction: "left" | "right"): Promise<void> {
  const status = await loadStatus(db, statusId);
  await requireManage(db, actor, status.projectId);
  const all = await listStatuses(db, status.projectId);
  const index = all.findIndex((s) => s.id === status.id);
  const neighbour = all[direction === "left" ? index - 1 : index + 1];
  if (!neighbour) return;
  await db.transaction(async (tx) => {
    await tx.update(statuses).set({ position: neighbour.position }).where(eq(statuses.id, status.id));
    await tx.update(statuses).set({ position: status.position }).where(eq(statuses.id, neighbour.id));
  });
}

export async function deleteStatus(db: DB, actor: Actor, statusId: string, targetStatusId: string): Promise<void> {
  const status = await loadStatus(db, statusId);
  await requireManage(db, actor, status.projectId);
  if (targetStatusId === statusId) throw new DomainError("VALIDATION", "Bitte eine andere Zielspalte wählen.");
  const all = await listStatuses(db, status.projectId);
  const target = all.find((s) => s.id === targetStatusId);
  if (!target) throw new DomainError("VALIDATION", "Bitte eine andere Zielspalte wählen.");

  await db.transaction(async (tx) => {
    const moving = await tx
      .select({ id: tasks.id, completedAt: tasks.completedAt })
      .from(tasks)
      .where(eq(tasks.statusId, status.id))
      .orderBy(byPosition(tasks.position));
    const [last] = await tx
      .select({ position: tasks.position })
      .from(tasks)
      .where(eq(tasks.statusId, target.id))
      .orderBy(desc(byPosition(tasks.position)))
      .limit(1);
    let previous = last?.position ?? null;
    for (const task of moving) {
      const position = generateKeyBetween(previous, null);
      previous = position;
      await tx
        .update(tasks)
        .set({
          statusId: target.id,
          position,
          completedAt: target.isDone ? (task.completedAt ?? new Date()) : null,
          updatedAt: sql`now()`,
        })
        .where(eq(tasks.id, task.id));
    }
    await tx.delete(statuses).where(eq(statuses.id, status.id));
  });
}
