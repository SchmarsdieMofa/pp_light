import { eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { taskAssignees, taskLabels } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { loadTaskAccess } from "./access";

export async function getTaskDetail(db: DB, actor: Actor, taskId: string) {
  try {
    const { task } = await loadTaskAccess(db, actor, taskId);
    const assigneeIds = (await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, task.id))).map((r) => r.userId);
    const labelIds = (await db.select().from(taskLabels).where(eq(taskLabels.taskId, task.id))).map((r) => r.labelId);
    return { id: task.id, assigneeIds, labelIds };
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") return null;
    throw err;
  }
}
