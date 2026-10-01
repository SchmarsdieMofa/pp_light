import { asc, eq } from "drizzle-orm";
import type { DB, Executor } from "@/server/db/client";
import { activityLog } from "@/server/db/schema";
import { notifyActivity } from "@/server/notifications/service";

export type ActivityAction =
  | "task.created"
  | "subtask.created"
  | "task.updated"
  | "task.assigneesChanged"
  | "task.labelsChanged"
  | "task.moved"
  | "task.autoMoved"
  | "schedule.changed"
  | "schedule.undone"
  | "dependency.added"
  | "dependency.updated"
  | "dependency.removed"
  | "comment.added"
  | "attachment.added"
  | "attachment.removed";

export type ActivityEntry = typeof activityLog.$inferSelect;

export async function recordActivity(
  ex: Executor,
  entry: {
    projectId: string;
    taskId?: string | null;
    actorId: string;
    action: ActivityAction;
    diff?: Record<string, unknown>;
    groupId?: string | null;
  },
): Promise<void> {
  const [recorded] = await ex.insert(activityLog).values({
    projectId: entry.projectId,
    taskId: entry.taskId ?? null,
    actorId: entry.actorId,
    action: entry.action,
    diff: entry.diff ?? {},
    groupId: entry.groupId ?? null,
  }).returning({ id: activityLog.id });
  await notifyActivity(ex, {
    id: recorded.id,
    projectId: entry.projectId,
    taskId: entry.taskId ?? null,
    actorId: entry.actorId,
    action: entry.action,
    diff: entry.diff ?? {},
  });
}

export function listActivity(db: DB, taskId: string): Promise<ActivityEntry[]> {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.taskId, taskId))
    .orderBy(asc(activityLog.createdAt));
}
