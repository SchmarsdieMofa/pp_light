import { and, desc, eq, sql } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { z } from "zod";
import { phaseSchema, type PhaseInput } from "@/lib/schemas/phase";
import type { DB, Executor } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { phases, projects, tasks } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import { listPhases, type Phase } from "./queries";

async function requireManage(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
}

async function loadPhase(ex: Executor, phaseId: string): Promise<Phase> {
  if (!z.uuid().safeParse(phaseId).success) throw new DomainError("NOT_FOUND", "Phase nicht gefunden.");
  const [phase] = await ex.select().from(phases).where(eq(phases.id, phaseId)).limit(1);
  if (!phase) throw new DomainError("NOT_FOUND", "Phase nicht gefunden.");
  return phase;
}

async function lockProject(ex: Executor, projectId: string): Promise<void> {
  await ex.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
}

function phaseError(error: unknown): never {
  if (isUniqueViolation(error)) throw new DomainError("VALIDATION", "Diese Phase gibt es schon.");
  throw error;
}

export async function createPhase(db: DB, actor: Actor, projectId: string, raw: PhaseInput): Promise<Phase> {
  const input = phaseSchema.parse(raw);
  await requireManage(db, actor, projectId);
  try {
    return await db.transaction(async (tx) => {
      await lockProject(tx, projectId);
      const [last] = await tx.select({ position: phases.position }).from(phases)
        .where(eq(phases.projectId, projectId)).orderBy(desc(byPosition(phases.position))).limit(1);
      const [phase] = await tx.insert(phases).values({
        ...input,
        projectId,
        position: generateKeyBetween(last?.position ?? null, null),
      }).returning();
      return phase;
    });
  } catch (error) {
    phaseError(error);
  }
}

export async function updatePhase(db: DB, actor: Actor, phaseId: string, raw: PhaseInput): Promise<void> {
  const input = phaseSchema.parse(raw);
  const phase = await loadPhase(db, phaseId);
  await requireManage(db, actor, phase.projectId);
  try {
    await db.transaction(async (tx) => {
      await lockProject(tx, phase.projectId);
      await loadPhase(tx, phaseId);
      await tx.update(phases).set(input).where(eq(phases.id, phaseId));
    });
  } catch (error) {
    phaseError(error);
  }
}

export async function movePhase(db: DB, actor: Actor, phaseId: string, direction: "left" | "right"): Promise<void> {
  const phase = await loadPhase(db, phaseId);
  await requireManage(db, actor, phase.projectId);
  await db.transaction(async (tx) => {
    await lockProject(tx, phase.projectId);
    const all = await listPhases(tx, phase.projectId);
    const index = all.findIndex((item) => item.id === phaseId);
    if (index < 0) throw new DomainError("NOT_FOUND", "Phase nicht gefunden.");
    const neighbour = all[index + (direction === "left" ? -1 : 1)];
    if (!neighbour) return;
    await tx.update(phases).set({ position: neighbour.position }).where(eq(phases.id, phaseId));
    await tx.update(phases).set({ position: all[index].position }).where(eq(phases.id, neighbour.id));
  });
}

export async function deletePhase(db: DB, actor: Actor, phaseId: string): Promise<void> {
  const phase = await loadPhase(db, phaseId);
  await requireManage(db, actor, phase.projectId);
  await db.transaction(async (tx) => {
    await lockProject(tx, phase.projectId);
    await loadPhase(tx, phaseId);
    await tx.update(tasks).set({
      phaseId: null,
      updatedAt: sql`greatest(now(), ${tasks.updatedAt} + interval '1 millisecond')`,
    }).where(and(eq(tasks.projectId, phase.projectId), eq(tasks.phaseId, phaseId)));
    await tx.delete(phases).where(eq(phases.id, phaseId));
  });
}
