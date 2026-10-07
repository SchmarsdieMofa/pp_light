import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import { createProjectSchema, type CreateProjectInput } from "@/lib/schemas/project";
import type { DB } from "@/server/db/client";
import { byPosition } from "@/server/db/order";
import { folderAccess, projectAccess, projectGroups, projectMembers, projects, statuses, tasks, userGroupMembers, userGroups, users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCanFillFolder } from "@/server/folders/access";
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
      if (input.folderId) await assertCanFillFolder(tx, actor, input.folderId);
      const [project] = await tx
        .insert(projects)
        .values({ name: input.name, key: input.key, description: input.description, folderId: input.folderId ?? null, createdBy: actor.id })
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
    .innerJoin(projectAccess, eq(projectAccess.projectId, projects.id))
    .where(and(eq(projectAccess.userId, actor.id), isNull(projects.archivedAt)))
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
    .select({ project: projects, role: projectAccess.role })
    .from(projects)
    .leftJoin(
      projectAccess,
      and(eq(projectAccess.projectId, projects.id), eq(projectAccess.userId, actor.id)),
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

export type Member = {
  id: string;
  name: string;
  email: string;
  /** What the person may do in the project: the highest role of their own membership and their groups. */
  role: ProjectRole;
  /** The person's own membership (null: they are in only through a group). */
  directRole: ProjectRole | null;
  /** Names of the project's groups the person is in. */
  groups: string[];
  /** The person has access through the project's folder (possibly besides a direct role). */
  viaFolder: boolean;
};

export async function listMembers(db: DB, projectId: string): Promise<Member[]> {
  const [people, direct, viaGroups, viaFolder] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: projectAccess.role })
      .from(projectAccess)
      .innerJoin(users, eq(users.id, projectAccess.userId))
      .where(eq(projectAccess.projectId, projectId))
      .orderBy(asc(users.name)),
    db.select({ userId: projectMembers.userId, role: projectMembers.role }).from(projectMembers).where(eq(projectMembers.projectId, projectId)),
    db
      .select({ userId: userGroupMembers.userId, name: userGroups.name })
      .from(projectGroups)
      .innerJoin(userGroups, eq(userGroups.id, projectGroups.groupId))
      .innerJoin(userGroupMembers, eq(userGroupMembers.groupId, projectGroups.groupId))
      .where(eq(projectGroups.projectId, projectId))
      .orderBy(asc(userGroups.name)),
    db
      .select({ userId: folderAccess.userId })
      .from(projects)
      .innerJoin(folderAccess, eq(folderAccess.folderId, projects.folderId))
      .where(eq(projects.id, projectId)),
  ]);
  const inFolder = new Set(viaFolder.map((row) => row.userId));
  return people.map((person) => ({
    ...person,
    directRole: direct.find((row) => row.userId === person.id)?.role ?? null,
    groups: viaGroups.filter((row) => row.userId === person.id).map((row) => row.name),
    viaFolder: inFolder.has(person.id),
  }));
}
