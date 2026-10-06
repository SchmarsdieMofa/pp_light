import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { wouldCreateCycle } from "@/lib/dependency-graph";
import { recordActivity } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { projects, taskDependencies, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";
import { propagateDates, type ScheduleMove } from "./scheduling";

const lagSchema = z.number().int().min(0).max(3650);
const idSchema = z.uuid();

async function lockProject(ex: Executor, projectId: string) {
  await ex.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
}

async function requirePair(ex: Executor, projectId: string, blockerId: string, blockedId: string) {
  const pair = await ex.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.projectId, projectId), inArray(tasks.id, [blockerId, blockedId])));
  if (pair.length !== 2) throw new DomainError("VALIDATION", "Beide Aufgaben müssen zum selben Projekt gehören.");
}

async function loadEdge(ex: Executor, blockerId: string, blockedId: string) {
  const [edge] = await ex.select().from(taskDependencies).where(and(
    eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, blockedId),
  )).limit(1);
  if (!edge) throw new DomainError("NOT_FOUND", "Abhängigkeit nicht gefunden.");
  return edge;
}

async function requireEdit(db: DB, actor: Actor, blockerId: string, blockedId: string) {
  idSchema.parse(blockerId);
  idSchema.parse(blockedId);
  if (blockerId === blockedId) throw new DomainError("VALIDATION", "Eine Aufgabe kann nicht von sich selbst abhängen.");
  const { task, role } = await loadTaskAccess(db, actor, blockedId);
  assertCan(actor, "task.update", projectCtx(role));
  return task.projectId;
}

/** A task spans its subtasks (at any depth), so it cannot wait for one of them or the other way round. */
async function assertNotAncestry(ex: Executor, blockerId: string, blockedId: string) {
  const pair = await ex.select({ id: tasks.id, path: tasks.path }).from(tasks).where(inArray(tasks.id, [blockerId, blockedId]));
  const [a, b] = pair;
  if (a && b && (a.path.startsWith(`${b.path}.`) || b.path.startsWith(`${a.path}.`))) {
    throw new DomainError("VALIDATION", "Eine Aufgabe und ihre Unteraufgabe können nicht voneinander abhängen – die Aufgabe umfasst ihre Unteraufgaben ohnehin.");
  }
}

class PreviewDone extends Error {
  constructor(readonly moves: ScheduleMove[]) {
    super("preview");
  }
}

export type DependencyPreviewMove = ScheduleMove & { key: string; path: string; title: string };

/** Which tasks adding this dependency would move – nothing is saved. */
export async function previewDependency(db: DB, actor: Actor, blockerId: string, blockedId: string, rawLagDays: number): Promise<DependencyPreviewMove[]> {
  const lagDays = lagSchema.parse(rawLagDays);
  const projectId = await requireEdit(db, actor, blockerId, blockedId);
  let moves: ScheduleMove[] = [];
  try {
    await db.transaction(async (tx) => {
      await insertDependency(tx, projectId, blockerId, blockedId, lagDays);
      const collected: ScheduleMove[] = [];
      await propagateDates(tx, projectId, [blockedId], true, actor.id, randomUUID(), collected);
      throw new PreviewDone(collected);
    });
  } catch (err) {
    if (!(err instanceof PreviewDone)) throw err;
    moves = err.moves;
  }
  if (moves.length === 0) return [];
  const rows = await db.select({ id: tasks.id, path: tasks.path, title: tasks.title, key: projects.key })
    .from(tasks).innerJoin(projects, eq(projects.id, tasks.projectId)).where(inArray(tasks.id, moves.map((move) => move.id)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return moves.flatMap((move) => {
    const row = byId.get(move.id);
    return row ? [{ ...move, key: row.key, path: row.path, title: row.title }] : [];
  });
}

async function insertDependency(tx: Executor, projectId: string, blockerId: string, blockedId: string, lagDays: number) {
  await lockProject(tx, projectId);
  await requirePair(tx, projectId, blockerId, blockedId);
  await assertNotAncestry(tx, blockerId, blockedId);
  const ids = (await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId))).map((task) => task.id);
  const existing = await tx.select().from(taskDependencies).where(inArray(taskDependencies.blockerId, ids));
  if (existing.some((edge) => edge.blockerId === blockerId && edge.blockedId === blockedId)) {
    throw new DomainError("VALIDATION", "Diese Abhängigkeit gibt es schon.");
  }
  if (wouldCreateCycle(existing, blockerId, blockedId)) {
    throw new DomainError("VALIDATION", "Diese Abhängigkeit würde einen Zyklus erzeugen.");
  }
  await tx.insert(taskDependencies).values({ blockerId, blockedId, lagDays });
}

export async function addDependency(db: DB, actor: Actor, blockerId: string, blockedId: string, rawLagDays: number) {
  const lagDays = lagSchema.parse(rawLagDays);
  const projectId = await requireEdit(db, actor, blockerId, blockedId);
  return db.transaction(async (tx) => {
    await insertDependency(tx, projectId, blockerId, blockedId, lagDays);
    const groupId = randomUUID();
    await recordActivity(tx, {
      projectId, taskId: blockedId, actorId: actor.id, action: "dependency.added", groupId,
      diff: { blockerId, lagDays },
    });
    const movedCount = await propagateDates(tx, projectId, [blockedId], true, actor.id, groupId);
    return { movedCount, groupId };
  });
}

export async function updateDependencyLag(db: DB, actor: Actor, blockerId: string, blockedId: string, rawLagDays: number) {
  const lagDays = lagSchema.parse(rawLagDays);
  const projectId = await requireEdit(db, actor, blockerId, blockedId);
  return db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await requirePair(tx, projectId, blockerId, blockedId);
    const edge = await loadEdge(tx, blockerId, blockedId);
    if (edge.lagDays === lagDays) return { movedCount: 0, groupId: null };
    await tx.update(taskDependencies).set({ lagDays }).where(and(
      eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, blockedId),
    ));
    const groupId = randomUUID();
    await recordActivity(tx, {
      projectId, taskId: blockedId, actorId: actor.id, action: "dependency.updated", groupId,
      diff: { blockerId, lagDays: [edge.lagDays, lagDays] },
    });
    const movedCount = await propagateDates(tx, projectId, [blockedId], true, actor.id, groupId);
    return { movedCount, groupId };
  });
}

export async function removeDependency(db: DB, actor: Actor, blockerId: string, blockedId: string): Promise<void> {
  const projectId = await requireEdit(db, actor, blockerId, blockedId);
  await db.transaction(async (tx) => {
    await lockProject(tx, projectId);
    await requirePair(tx, projectId, blockerId, blockedId);
    const edge = await loadEdge(tx, blockerId, blockedId);
    await tx.delete(taskDependencies).where(and(
      eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, blockedId),
    ));
    await recordActivity(tx, {
      projectId, taskId: blockedId, actorId: actor.id, action: "dependency.removed",
      diff: { blockerId, lagDays: edge.lagDays },
    });
  });
}
