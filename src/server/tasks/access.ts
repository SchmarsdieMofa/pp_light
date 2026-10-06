import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import type { Executor } from "@/server/db/client";
import { projectAccess, projects, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { AccessRole, Actor } from "@/server/permissions";

export type Task = typeof tasks.$inferSelect;
/** `role` is "readonly" while the task's project is archived (see projectCtx). */
export type TaskAccess = { task: Task; role: AccessRole };

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
    .select({ task: tasks, role: projectAccess.role, archivedAt: projects.archivedAt })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(projectAccess, and(eq(projectAccess.projectId, tasks.projectId), eq(projectAccess.userId, actor.id)))
    .where(eq(tasks.id, taskId))
    .limit(1);
  const [row] = opts.forUpdate ? await query.for("update", { of: tasks }) : await query;
  if (!row) throw notFound();
  const role: ProjectRole | null = row.role;
  if (!role) throw notFound();
  return { task: row.task, role: row.archivedAt ? "readonly" : role };
}
