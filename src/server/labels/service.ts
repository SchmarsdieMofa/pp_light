import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { labelSchema, type LabelInput } from "@/lib/schemas/task";
import type { DB } from "@/server/db/client";
import { labels } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";

export type Label = typeof labels.$inferSelect;

export async function createLabel(db: DB, actor: Actor, raw: LabelInput): Promise<Label> {
  const input = labelSchema.parse(raw);
  const access = await requireProjectAccess(db, actor, input.projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
  try {
    const [label] = await db.insert(labels).values(input).returning();
    return label;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("LABEL_TAKEN", `Das Label „${input.name}“ gibt es schon.`);
    throw err;
  }
}

export async function deleteLabel(db: DB, actor: Actor, labelId: string): Promise<void> {
  const notFound = new DomainError("NOT_FOUND", "Label nicht gefunden.");
  if (!z.uuid().safeParse(labelId).success) throw notFound;
  const [label] = await db.select().from(labels).where(eq(labels.id, labelId)).limit(1);
  if (!label) throw notFound;
  const access = await requireProjectAccess(db, actor, label.projectId);
  assertCan(actor, "project.update", projectCtx(access.role));
  await db.delete(labels).where(eq(labels.id, labelId));
}

export function listLabels(db: DB, projectId: string): Promise<Label[]> {
  return db
    .select()
    .from(labels)
    .where(eq(labels.projectId, projectId))
    .orderBy(asc(sql`lower(${labels.name})`));
}
