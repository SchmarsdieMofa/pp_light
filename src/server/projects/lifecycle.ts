import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { attachments, comments, phases, projectMembers, projects, statuses, taskAssignees, tasks, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, can, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess, type Project } from "./service";

export const projectDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100, "Höchstens 100 Zeichen"),
  description: z.string().trim().max(2000, "Höchstens 2000 Zeichen"),
});
export type ProjectDetailsInput = z.input<typeof projectDetailsSchema>;

export const closeProjectSchema = z.object({
  note: z.string().trim().max(5000, "Höchstens 5000 Zeichen").default(""),
  closeOpenTasks: z.boolean().default(false),
});
export type CloseProjectInput = z.input<typeof closeProjectSchema>;

/** Owners and admins steer the lifecycle – also while the project is archived (that is how it comes back). */
async function requireSteering(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  if (!can(actor, "project.update", projectCtx(access.memberRole))) {
    throw new DomainError("FORBIDDEN", "Nur Owner können das Projekt abschließen, archivieren oder löschen.");
  }
  return access;
}

export async function updateProjectDetails(db: DB, actor: Actor, projectId: string, raw: ProjectDetailsInput): Promise<void> {
  const { role } = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.update", projectCtx(role));
  const input = projectDetailsSchema.parse(raw);
  await db.update(projects).set(input).where(eq(projects.id, projectId));
}

/** Hides the project from lists and makes it read-only, without a review. */
export async function archiveProject(db: DB, actor: Actor, projectId: string): Promise<void> {
  const { project } = await requireSteering(db, actor, projectId);
  if (project.archivedAt) return;
  await db.update(projects).set({ archivedAt: new Date(), completedAt: null }).where(eq(projects.id, projectId));
}

/** Closes the project after the review: optionally marks open tasks done, keeps the closing note, archives it. */
export async function completeProject(db: DB, actor: Actor, projectId: string, raw: CloseProjectInput): Promise<void> {
  const { project } = await requireSteering(db, actor, projectId);
  if (project.archivedAt) throw new DomainError("CONFLICT", "Das Projekt ist bereits archiviert.");
  const input = closeProjectSchema.parse(raw);
  await db.transaction(async (tx) => {
    if (input.closeOpenTasks) {
      const projectStatuses = await tx.select().from(statuses).where(eq(statuses.projectId, projectId)).orderBy(byPosition(statuses.position));
      const done = projectStatuses.find((s) => s.isDone);
      if (!done) throw new DomainError("VALIDATION", "Dieses Projekt hat keine Erledigt-Spalte.");
      const open = projectStatuses.filter((s) => !s.isDone).map((s) => s.id);
      if (open.length > 0) {
        await tx
          .update(tasks)
          .set({ statusId: done.id, updatedAt: new Date() })
          .where(and(eq(tasks.projectId, projectId), inArray(tasks.statusId, open)));
      }
    }
    const now = new Date();
    await tx.update(projects).set({ archivedAt: now, completedAt: now, closingNote: input.note }).where(eq(projects.id, projectId));
  });
}

/** Brings an archived or completed project back into normal, editable use. */
export async function restoreProject(db: DB, actor: Actor, projectId: string): Promise<void> {
  await requireSteering(db, actor, projectId);
  await db.update(projects).set({ archivedAt: null, completedAt: null }).where(eq(projects.id, projectId));
}

/** Deletes the project with everything in it (tasks, comments, files). `confirmKey` must repeat the project key. */
export async function deleteProject(db: DB, actor: Actor, projectId: string, confirmKey: string, uploadDir: string): Promise<void> {
  const { project } = await requireSteering(db, actor, projectId);
  if (confirmKey.trim().toUpperCase() !== project.key) {
    throw new DomainError("VALIDATION", `Zum Löschen bitte das Kürzel ${project.key} eingeben.`);
  }
  const files = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(tasks, eq(tasks.id, attachments.taskId))
    .where(eq(tasks.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
  // Rows are gone (cascade); the files follow. Storage keys are server-generated UUIDs inside uploadDir.
  await Promise.all(files.map((f) => rm(resolve(uploadDir, f.storageKey), { force: true })));
}

export type ProjectReport = {
  project: Project;
  tasks: { total: number; done: number; open: number; overdue: number; subtasks: number };
  byStatus: { name: string; color: string; isDone: boolean; count: number }[];
  openTasks: { id: string; number: number; title: string; dueDate: string | null; statusName: string }[];
  milestones: { name: string; date: string | null; reached: boolean }[];
  members: { id: string; name: string; role: ProjectRole; assigned: number; done: number }[];
  comments: number;
  attachments: number;
  lastDueDate: string | null;
};

/** Figures for the closing review: progress, what is still open, milestones and who did what. */
export async function getProjectReport(db: DB, actor: Actor, projectId: string, today: string): Promise<ProjectReport> {
  const { project } = await requireProjectAccess(db, actor, projectId);
  const [statusRows, openRows, milestoneRows, memberRows, [commentRow], [attachmentRow], [subtaskRow], [dueRow]] = await Promise.all([
    db
      .select({
        name: statuses.name,
        color: statuses.color,
        isDone: statuses.isDone,
        count: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null)::int`,
        overdue: sql<number>`count(${tasks.id}) filter (where ${tasks.parentId} is null and ${tasks.dueDate} < ${today})::int`,
      })
      .from(statuses)
      .leftJoin(tasks, eq(tasks.statusId, statuses.id))
      .where(eq(statuses.projectId, projectId))
      .groupBy(statuses.id)
      .orderBy(byPosition(statuses.position)),
    db
      .select({ id: tasks.id, number: tasks.number, title: tasks.title, dueDate: tasks.dueDate, statusName: statuses.name })
      .from(tasks)
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(and(eq(tasks.projectId, projectId), eq(statuses.isDone, false), sql`${tasks.parentId} is null`))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.number))
      .limit(50),
    db
      .select({ name: phases.name, startDate: phases.startDate, endDate: phases.endDate })
      .from(phases)
      .where(and(eq(phases.projectId, projectId), eq(phases.isMilestone, true)))
      .orderBy(byPosition(phases.position)),
    db
      .select({
        id: users.id,
        name: users.name,
        role: projectMembers.role,
        // Count joined tasks, not assignments: assignments in other projects join no task (NULL).
        assigned: sql<number>`count(distinct ${tasks.id})::int`,
        done: sql<number>`count(distinct ${tasks.id}) filter (where ${statuses.isDone})::int`,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .leftJoin(taskAssignees, eq(taskAssignees.userId, projectMembers.userId))
      .leftJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), eq(tasks.projectId, projectId)))
      .leftJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(eq(projectMembers.projectId, projectId))
      .groupBy(users.id, users.name, projectMembers.role)
      .orderBy(desc(sql`count(distinct ${tasks.id}) filter (where ${statuses.isDone})`), asc(users.name)),
    db.select({ n: count() }).from(comments).innerJoin(tasks, eq(tasks.id, comments.taskId)).where(eq(tasks.projectId, projectId)),
    db.select({ n: count() }).from(attachments).innerJoin(tasks, eq(tasks.id, attachments.taskId)).where(eq(tasks.projectId, projectId)),
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), isNotNull(tasks.parentId))),
    db.select({ last: sql<string | null>`max(${tasks.dueDate})` }).from(tasks).where(eq(tasks.projectId, projectId)),
  ]);

  const done = statusRows.filter((s) => s.isDone).reduce((sum, s) => sum + s.count, 0);
  const total = statusRows.reduce((sum, s) => sum + s.count, 0);
  const overdue = statusRows.filter((s) => !s.isDone).reduce((sum, s) => sum + s.overdue, 0);
  return {
    project,
    tasks: { total, done, open: total - done, overdue, subtasks: subtaskRow?.n ?? 0 },
    byStatus: statusRows.map(({ name, color, isDone, count }) => ({ name, color, isDone, count })),
    openTasks: openRows,
    milestones: milestoneRows.map((m) => {
      const date = m.endDate ?? m.startDate;
      return { name: m.name, date, reached: !!date && date <= today };
    }),
    members: memberRows,
    comments: commentRow?.n ?? 0,
    attachments: attachmentRow?.n ?? 0,
    lastDueDate: dueRow?.last ?? null,
  };
}

/** Archived and completed projects the actor can see, newest first. */
export async function listArchivedProjects(db: DB, actor: Actor): Promise<Project[]> {
  const base = db.select({ project: projects }).from(projects);
  const rows =
    actor.role === "admin"
      ? await base.where(isNotNull(projects.archivedAt)).orderBy(desc(projects.archivedAt))
      : await base
          .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
          .where(isNotNull(projects.archivedAt))
          .orderBy(desc(projects.archivedAt));
  return rows.map((r) => r.project);
}
