import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { projectPins } from "@/server/db/schema";
import type { Actor } from "@/server/permissions";
import { requireProjectAccess } from "./service";

/** The projects this person pinned, oldest pin first. May include projects they have lost access to since; callers intersect. */
export async function listPinnedProjectIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ projectId: projectPins.projectId })
    .from(projectPins)
    .where(eq(projectPins.userId, userId))
    .orderBy(asc(projectPins.pinnedAt), asc(projectPins.projectId));
  return rows.map((row) => row.projectId);
}

/** Pins or unpins a project for the actor. Only for projects they can see; repeating it changes nothing. */
export async function setProjectPinned(db: DB, actor: Actor, projectId: string, pinned: boolean): Promise<void> {
  const { project } = await requireProjectAccess(db, actor, projectId);
  if (pinned) {
    await db.insert(projectPins).values({ userId: actor.id, projectId: project.id }).onConflictDoNothing();
  } else {
    await db.delete(projectPins).where(and(eq(projectPins.userId, actor.id), eq(projectPins.projectId, project.id)));
  }
}
