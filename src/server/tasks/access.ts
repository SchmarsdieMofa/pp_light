import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import type { Executor } from "@/server/db/client";
import { projectMembers, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { Actor } from "@/server/permissions";

export type Task = typeof tasks.$inferSelect;
export type TaskAccess = { task: Task; role: ProjectRole | "admin" };

const notFound = () => new DomainError("NOT_FOUND", "Aufgabe nicht gefunden.");

/**
 * Task plus the actor's project role. Missing task and missing access look the same (no leak).
 * `forUpdate` locks the task row until the caller's transaction ends (serializes set-replacing writes).
 */
export async function loadTaskAccess(
  ex: Executor,
  actor: Actor,
  taskId: string,
  opts: { forUpdate?: boolean } = {},
): Promise<TaskAccess> {
  if (!z.uuid().safeParse(taskId).success) throw notFound();
  const query = ex
    .select({ task: tasks, role: projectMembers.role })
    .from(tasks)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, tasks.projectId), eq(projectMembers.userId, actor.id)))
    .where(eq(tasks.id, taskId))
    .limit(1);
  const [row] = opts.forUpdate ? await query.for("update", { of: tasks }) : await query;
  if (!row) throw notFound();
  if (row.role) return { task: row.task, role: row.role };
  if (actor.role === "admin") return { task: row.task, role: "admin" };
  throw notFound();
}
