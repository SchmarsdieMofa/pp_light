import { desc, eq } from "drizzle-orm";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import { checklistTextSchema } from "@/lib/schemas/task";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { checklistItems, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "@/server/tasks/access";

export type ChecklistItem = typeof checklistItems.$inferSelect;

async function requireEditableTask(db: DB, actor: Actor, taskId: string) {
  const { task, role } = await loadTaskAccess(db, actor, taskId);
  assertCan(actor, "task.update", projectCtx(role));
  return task;
}

async function requireEditableItem(db: DB, actor: Actor, itemId: string): Promise<ChecklistItem> {
  const notFound = new DomainError("NOT_FOUND", "Checklisten-Punkt nicht gefunden.");
  if (!z.uuid().safeParse(itemId).success) throw notFound;
  const [item] = await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1);
  if (!item) throw notFound;
  await requireEditableTask(db, actor, item.taskId);
  return item;
}

export async function addChecklistItem(db: DB, actor: Actor, taskId: string, rawText: string): Promise<ChecklistItem> {
  const text = checklistTextSchema.parse(rawText);
  const task = await requireEditableTask(db, actor, taskId);
  const [last] = await db
    .select({ position: checklistItems.position })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, task.id))
    .orderBy(desc(byPosition(checklistItems.position)))
    .limit(1);
  const [item] = await db
    .insert(checklistItems)
    .values({ taskId: task.id, text, position: generateKeyBetween(last?.position ?? null, null) })
    .returning();
  return item;
}

export async function setChecklistItemDone(db: DB, actor: Actor, itemId: string, done: boolean): Promise<void> {
  const item = await requireEditableItem(db, actor, itemId);
  await db.update(checklistItems).set({ done }).where(eq(checklistItems.id, item.id));
}

export async function setChecklistItemText(db: DB, actor: Actor, itemId: string, rawText: string): Promise<void> {
  const text = checklistTextSchema.parse(rawText);
  const item = await requireEditableItem(db, actor, itemId);
  await db.update(checklistItems).set({ text }).where(eq(checklistItems.id, item.id));
}

/**
 * Puts the items in the given order. The client sends the whole new order, so a drag needs no neighbour
 * bookkeeping; if the list changed in between (someone added or removed an item), it is refused as stale.
 */
export async function reorderChecklist(db: DB, actor: Actor, taskId: string, orderedIds: string[]): Promise<void> {
  const task = await requireEditableTask(db, actor, taskId);
  await db.transaction(async (tx) => {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, task.id)).for("update");
    const current = await tx.select({ id: checklistItems.id }).from(checklistItems).where(eq(checklistItems.taskId, task.id));
    const known = new Set(current.map((item) => item.id));
    if (orderedIds.length !== known.size || new Set(orderedIds).size !== known.size || orderedIds.some((id) => !known.has(id))) {
      throw new DomainError("CONFLICT", "Die Checkliste wurde zwischenzeitlich geändert. Bitte neu laden.");
    }
    const keys = generateNKeysBetween(null, null, orderedIds.length);
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(checklistItems).set({ position: keys[i] }).where(eq(checklistItems.id, id));
    }
  });
}

export async function deleteChecklistItem(db: DB, actor: Actor, itemId: string): Promise<void> {
  const item = await requireEditableItem(db, actor, itemId);
  await db.delete(checklistItems).where(eq(checklistItems.id, item.id));
}

export function listChecklist(db: DB, taskId: string): Promise<ChecklistItem[]> {
  return db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(byPosition(checklistItems.position));
}
