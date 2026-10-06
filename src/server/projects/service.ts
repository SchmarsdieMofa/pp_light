import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import { createProjectSchema, type CreateProjectInput } from "@/lib/schemas/project";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { projectMembers, projects, statuses, tasks, users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, type AccessRole, type Actor } from "@/server/permissions";

export type Project = typeof projects.$inferSelect;
export type Status = typeof statuses.$inferSelect;
/**
 * `role` is what the actor may do now ("readonly" while the project is archived); `memberRole` is the
 * unmasked role, which decides who may restore, complete or delete the project.
 */
export type ProjectAccess = { project: Project; role: AccessRole; memberRole: ProjectRole };

const DEFAULT_STATUSES = [
  { name: "Offen", color: "#94a3b8", isDone: false },
  { name: "In Arbeit", color: "#3b82f6", isDone: false },
  { name: "Review", color: "#a855f7", isDone: false },
  { name: "Fertig", color: "#22c55e", isDone: true },
] as const;

export async function createProject(db: DB, actor: Actor, rawInput: CreateProjectInput): Promise<Project> {
  assertCan(actor, "project.create");
  const input = createProjectSchema.parse(rawInput);
  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ name: input.name, key: input.key, description: input.description, createdBy: actor.id })
        .returning();
      await tx.insert(projectMembers).values({ projectId: project.id, userId: actor.id, role: "owner" });
      const positions = generateNKeysBetween(null, null, DEFAULT_STATUSES.length);
      await tx
        .insert(statuses)
        .values(DEFAULT_STATUSES.map((s, i) => ({ ...s, projectId: project.id, position: positions[i] })));
      return project;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DomainError("KEY_TAKEN", `Das Kürzel ${input.key} ist bereits vergeben.`);
    }
    throw err;
  }
}

export async function listProjectsForUser(db: DB, actor: Actor): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.userId, actor.id), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));
  return rows.map((r) => r.project);
}

export async function listProjectOverview(db: DB, actor: Actor, today: string) {
  const visible = await listProjectsForUser(db, actor);
  if (visible.length === 0) return [];

  const counts = await db
    .select({
      projectId: tasks.projectId,
      open: sql<number>`count(*) filter (where not ${statuses.isDone})::int`,
      overdue: sql<number>`count(*) filter (where not ${statuses.isDone} and ${tasks.dueDate} < ${today})::int`,
    })
    .from(tasks)
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(and(
      inArray(tasks.projectId, visible.map((project) => project.id)),
      isNull(tasks.parentId),
    ))
    .groupBy(tasks.projectId);
  const byId = new Map(counts.map((row) => [row.projectId, row]));
  return visible.map((project) => ({
    ...project,
    openTaskCount: byId.get(project.id)?.open ?? 0,
    overdueTaskCount: byId.get(project.id)?.overdue ?? 0,
  }));
}

/** Project plus the actor's role in it; null if it does not exist or the actor may not see it. */
export async function getProjectForUser(db: DB, actor: Actor, projectId: string): Promise<ProjectAccess | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) return null;
  const memberRole = row.role;
  if (!memberRole) return null;
  return { project: row.project, role: row.project.archivedAt ? "readonly" : memberRole, memberRole };
}

export function listStatuses(db: DB, projectId: string): Promise<Status[]> {
  return db
    .select()
    .from(statuses)
    .where(eq(statuses.projectId, projectId))
    .orderBy(byPosition(statuses.position));
}

/** Like getProjectForUser, but throws NOT_FOUND (for services/actions). */
export async function requireProjectAccess(db: DB, actor: Actor, projectId: string): Promise<ProjectAccess> {
  const access = await getProjectForUser(db, actor, projectId);
  if (!access) throw new DomainError("NOT_FOUND", "Projekt nicht gefunden.");
  return access;
}

export type Member = { id: string; name: string; email: string; role: ProjectRole };

export function listMembers(db: DB, projectId: string): Promise<Member[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(asc(users.name));
}
