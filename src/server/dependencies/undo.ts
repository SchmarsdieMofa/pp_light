import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordActivity } from "@/server/activity/service";
import type { DB } from "@/server/db/client";
import { activityLog, projects, tasks } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";

const dates = z.object({ startDate: z.iso.date().nullable(), dueDate: z.iso.date().nullable() });
const scheduleDiff = z.object({ before: dates, after: dates });

export async function undoScheduleGroup(db: DB, actor: Actor, rawGroupId: string): Promise<void> {
  const groupId = z.uuid().parse(rawGroupId);
  const [first] = await db.select({ projectId: activityLog.projectId }).from(activityLog)
    .where(eq(activityLog.groupId, groupId)).limit(1);
  if (!first) throw new DomainError("NOT_FOUND", "Verschiebung nicht gefunden.");
  const access = await requireProjectAccess(db, actor, first.projectId);
  assertCan(actor, "task.update", projectCtx(access.role));

  await db.transaction(async (tx) => {
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, first.projectId)).for("update");
    const entries = await tx.select().from(activityLog).where(eq(activityLog.groupId, groupId));
    if (entries.some((entry) => entry.action === "schedule.undone")) {
      throw new DomainError("CONFLICT", "Diese Verschiebung wurde bereits rückgängig gemacht.");
    }
    if (!entries.some((entry) => entry.action === "schedule.changed")) {
      throw new DomainError("VALIDATION", "Diese Verschiebung kann nicht rückgängig gemacht werden.");
    }
    const changes = entries.filter((entry) => entry.action === "schedule.changed" || entry.action === "task.autoMoved");
    const verified = [] as { taskId: string; before: z.infer<typeof dates> }[];
    for (const entry of changes) {
      if (!entry.taskId) throw new DomainError("CONFLICT", "Verschiebung ist unvollständig.");
      const parsed = scheduleDiff.safeParse(entry.diff);
      if (!parsed.success) throw new DomainError("CONFLICT", "Verschiebung ist unvollständig.");
      const [task] = await tx.select({ projectId: tasks.projectId, startDate: tasks.startDate, dueDate: tasks.dueDate })
        .from(tasks).where(eq(tasks.id, entry.taskId)).limit(1);
      if (!task || task.projectId !== first.projectId || task.startDate !== parsed.data.after.startDate || task.dueDate !== parsed.data.after.dueDate) {
        throw new DomainError("CONFLICT", "Die Termine wurden zwischenzeitlich geändert. Rückgängig ist nicht mehr möglich.");
      }
      verified.push({ taskId: entry.taskId, before: parsed.data.before });
    }
    for (const change of verified) {
      await tx.update(tasks).set({
        ...change.before,
        updatedAt: sql`greatest(now(), ${tasks.updatedAt} + interval '1 millisecond')`,
      }).where(eq(tasks.id, change.taskId));
    }
    for (const change of verified) {
      await recordActivity(tx, {
        projectId: first.projectId, taskId: change.taskId, actorId: actor.id, action: "schedule.undone", groupId,
        diff: { taskIds: verified.map((item) => item.taskId) },
      });
    }
  });
}
