import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { recordActivity, type ActivityAction } from "@/server/activity/service";
import type { DB, Executor } from "@/server/db/client";
import { labels, projectAccess, taskAssignees, taskLabels } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { loadTaskAccess } from "./access";

const idList = z.array(z.uuid()).max(50).transform((ids) => [...new Set(ids)]);

function parseIds(ids: string[], message: string): string[] {
  const parsed = idList.safeParse(ids);
  if (!parsed.success) throw new DomainError("VALIDATION", message);
  return parsed.data;
}

function diffSets(before: string[], after: string[]) {
  return {
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  };
}

export async function setTaskAssignees(db: DB, actor: Actor, taskId: string, userIds: string[]): Promise<void> {
  const ids = parseIds(userIds, "Ungültige Zuständige.");
  await db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId, { forUpdate: true });
    assertCan(actor, "task.update", projectCtx(role));
    if (ids.length > 0) {
      const members = await tx
        .select({ userId: projectAccess.userId })
        .from(projectAccess)
        .where(and(eq(projectAccess.projectId, task.projectId), inArray(projectAccess.userId, ids)));
      if (members.length !== ids.length) throw new DomainError("VALIDATION", "Nur Projektmitglieder können zuständig sein.");
    }
    const before = (await tx.select().from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((r) => r.userId);
    const change = diffSets(before, ids);
    if (change.added.length === 0 && change.removed.length === 0) return;
    await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, task.id));
    if (ids.length > 0) await tx.insert(taskAssignees).values(ids.map((userId) => ({ taskId: task.id, userId })));
    await log(tx, task.projectId, task.id, actor.id, "task.assigneesChanged", change);
  });
}

export async function setTaskLabels(db: DB, actor: Actor, taskId: string, labelIds: string[]): Promise<void> {
  const ids = parseIds(labelIds, "Ungültige Labels.");
  await db.transaction(async (tx) => {
    const { task, role } = await loadTaskAccess(tx, actor, taskId, { forUpdate: true });
    assertCan(actor, "task.update", projectCtx(role));
    if (ids.length > 0) {
      const found = await tx
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectId, task.projectId), inArray(labels.id, ids)));
      if (found.length !== ids.length) throw new DomainError("VALIDATION", "Unbekanntes Label.");
    }
    const before = (await tx.select().from(taskLabels).where(eq(taskLabels.taskId, task.id))).map((r) => r.labelId);
    const change = diffSets(before, ids);
    if (change.added.length === 0 && change.removed.length === 0) return;
    await tx.delete(taskLabels).where(eq(taskLabels.taskId, task.id));
    if (ids.length > 0) await tx.insert(taskLabels).values(ids.map((labelId) => ({ taskId: task.id, labelId })));
    await log(tx, task.projectId, task.id, actor.id, "task.labelsChanged", change);
  });
}

function log(
  tx: Executor,
  projectId: string,
  taskId: string,
  actorId: string,
  action: ActivityAction,
  diff: { added: string[]; removed: string[] },
) {
  return recordActivity(tx, { projectId, taskId, actorId, action, diff });
}
