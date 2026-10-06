import { and, asc, count, eq, ilike, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { GROUP_PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { projectGroups, userGroupMembers, userGroups, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { pruneAssignees } from "@/server/projects/access-cleanup";
import { requireProjectAccess } from "@/server/projects/service";
import { escapeLike } from "@/server/tasks/queries";

const NO_ID = "00000000-0000-0000-0000-000000000000";

/** Active people in the group. */
async function groupSize(db: DB, groupId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(userGroupMembers)
    .innerJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true)))
    .where(eq(userGroupMembers.groupId, groupId));
  return row.n;
}

async function requireGroup(db: DB, groupId: string) {
  const [group] = z.uuid().safeParse(groupId).success
    ? await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.id, groupId)).limit(1)
    : [];
  if (!group) throw new DomainError("NOT_FOUND", "Gruppe nicht gefunden.");
}

async function requireProjectOwner(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.manageMembers", projectCtx(access.role));
}

/** Groups never grant ownership: whoever edits a group (a manager, say) must not be able to make owners that way. */
function parseGroupRole(raw: string): ProjectRole {
  const role = z.enum(GROUP_PROJECT_ROLES).safeParse(raw);
  if (!role.success) throw new DomainError("VALIDATION", "Eine Gruppe kann im Projekt nur Mitglied oder Gast sein.");
  return role.data;
}

export type GroupSuggestion = { id: string; name: string; /** Active people in the group. */ size: number };

/**
 * Groups for the project's "add member" picker (those not yet in the project). Like the people search,
 * nothing is listed without a query unless `browse` is set. Only owners (who may add members) get an answer.
 */
export async function searchAddableGroups(
  db: DB,
  actor: Actor,
  projectId: string,
  rawQuery: string,
  opts: { browse?: boolean } = {},
): Promise<GroupSuggestion[]> {
  await requireProjectOwner(db, actor, projectId);
  const query = rawQuery.trim().slice(0, 100);
  if (!query && !opts.browse) return [];
  const present = db.select({ id: projectGroups.groupId }).from(projectGroups).where(eq(projectGroups.projectId, projectId));
  const found = await db
    .select({ id: userGroups.id, name: userGroups.name })
    .from(userGroups)
    .where(and(notInArray(userGroups.id, present), query ? ilike(userGroups.name, `%${escapeLike(query)}%`) : undefined))
    .orderBy(asc(sql`lower(${userGroups.name})`))
    .limit(opts.browse ? 50 : 5);
  return Promise.all(found.map(async (group) => ({ ...group, size: await groupSize(db, group.id) })));
}

export type ProjectGroup = { id: string; name: string; role: ProjectRole; size: number };

/** The groups that are part of the project, with the role their people have there. */
export async function listProjectGroups(db: DB, projectId: string): Promise<ProjectGroup[]> {
  const rows = await db
    .select({ id: userGroups.id, name: userGroups.name, role: projectGroups.role })
    .from(projectGroups)
    .innerJoin(userGroups, eq(userGroups.id, projectGroups.groupId))
    .where(eq(projectGroups.projectId, projectId))
    .orderBy(asc(sql`lower(${userGroups.name})`));
  return Promise.all(rows.map(async (row) => ({ ...row, size: await groupSize(db, row.id) })));
}

/** Makes the group part of the project: whoever is in it – now or later – has `role` there. */
export async function addGroupToProject(db: DB, actor: Actor, projectId: string, groupId: string, rawRole: string): Promise<{ size: number }> {
  const role = parseGroupRole(rawRole);
  await requireProjectOwner(db, actor, projectId);
  await requireGroup(db, groupId);
  const inserted = await db.insert(projectGroups).values({ projectId, groupId, role }).onConflictDoNothing().returning({ id: projectGroups.groupId });
  if (inserted.length === 0) throw new DomainError("VALIDATION", "Diese Gruppe ist schon im Projekt.");
  return { size: await groupSize(db, groupId) };
}

export async function changeProjectGroupRole(db: DB, actor: Actor, projectId: string, groupId: string, rawRole: string): Promise<void> {
  const role = parseGroupRole(rawRole);
  await requireProjectOwner(db, actor, projectId);
  const changed = await db
    .update(projectGroups)
    .set({ role })
    .where(and(eq(projectGroups.projectId, projectId), eq(projectGroups.groupId, z.uuid().safeParse(groupId).success ? groupId : NO_ID)))
    .returning({ id: projectGroups.groupId });
  if (changed.length === 0) throw new DomainError("NOT_FOUND", "Diese Gruppe gehört nicht zum Projekt.");
}

/** Takes the group out of the project; people who are in only through it lose access (and their assignments). */
export async function removeProjectGroup(db: DB, actor: Actor, projectId: string, groupId: string): Promise<void> {
  await requireProjectOwner(db, actor, projectId);
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(projectGroups)
      .where(and(eq(projectGroups.projectId, projectId), eq(projectGroups.groupId, z.uuid().safeParse(groupId).success ? groupId : NO_ID)))
      .returning({ id: projectGroups.groupId });
    if (removed.length === 0) throw new DomainError("NOT_FOUND", "Diese Gruppe gehört nicht zum Projekt.");
    await pruneAssignees(tx, [projectId]);
  });
}
