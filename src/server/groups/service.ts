import { and, asc, count, eq, ilike, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ProjectRole } from "@/lib/enums";
import { PROJECT_ROLES } from "@/lib/enums";
import type { DB } from "@/server/db/client";
import { projectMembers, userGroupMembers, userGroups, users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { requireProjectAccess } from "@/server/projects/service";
import { escapeLike } from "@/server/tasks/queries";

const nameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(80, "Der Name darf höchstens 80 Zeichen haben.");

export type GroupRow = { id: string; name: string; members: { id: string; name: string; email: string; active: boolean }[] };

function requireAdmin(actor: Actor) {
  assertCan(actor, "admin.manageUsers");
}

function parseName(raw: string): string {
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", parsed.error.issues[0].message);
  return parsed.data;
}

async function requireGroup(db: DB, groupId: string) {
  const [group] = z.uuid().safeParse(groupId).success
    ? await db.select().from(userGroups).where(eq(userGroups.id, groupId)).limit(1)
    : [];
  if (!group) throw new DomainError("NOT_FOUND", "Gruppe nicht gefunden.");
  return group;
}

/** All groups with their members, for the admin screen. */
export async function listGroups(db: DB, actor: Actor): Promise<GroupRow[]> {
  requireAdmin(actor);
  const groups = await db.select().from(userGroups).orderBy(asc(sql`lower(${userGroups.name})`));
  if (groups.length === 0) return [];
  const rows = await db
    .select({ groupId: userGroupMembers.groupId, id: users.id, name: users.name, email: users.email, active: users.active })
    .from(userGroupMembers)
    .innerJoin(users, eq(users.id, userGroupMembers.userId))
    .orderBy(asc(users.name), asc(users.email));
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    members: rows.filter((row) => row.groupId === group.id).map(({ id, name, email, active }) => ({ id, name, email, active })),
  }));
}

export async function createGroup(db: DB, actor: Actor, rawName: string): Promise<{ id: string }> {
  requireAdmin(actor);
  const name = parseName(rawName);
  try {
    const [group] = await db.insert(userGroups).values({ name }).returning({ id: userGroups.id });
    return group;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", `Es gibt schon eine Gruppe „${name}“.`);
    throw err;
  }
}

export async function renameGroup(db: DB, actor: Actor, groupId: string, rawName: string): Promise<void> {
  requireAdmin(actor);
  const name = parseName(rawName);
  await requireGroup(db, groupId);
  try {
    await db.update(userGroups).set({ name }).where(eq(userGroups.id, groupId));
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", `Es gibt schon eine Gruppe „${name}“.`);
    throw err;
  }
}

export async function deleteGroup(db: DB, actor: Actor, groupId: string): Promise<void> {
  requireAdmin(actor);
  await requireGroup(db, groupId);
  await db.delete(userGroups).where(eq(userGroups.id, groupId));
}

export async function addGroupMember(db: DB, actor: Actor, groupId: string, userId: string): Promise<void> {
  requireAdmin(actor);
  await requireGroup(db, groupId);
  const [user] = z.uuid().safeParse(userId).success ? await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1) : [];
  if (!user) throw new DomainError("NOT_FOUND", "Person nicht gefunden.");
  await db.insert(userGroupMembers).values({ groupId, userId }).onConflictDoNothing();
}

export async function removeGroupMember(db: DB, actor: Actor, groupId: string, userId: string): Promise<void> {
  requireAdmin(actor);
  await requireGroup(db, groupId);
  if (!z.uuid().safeParse(userId).success) return;
  await db.delete(userGroupMembers).where(and(eq(userGroupMembers.groupId, groupId), eq(userGroupMembers.userId, userId)));
}

export type GroupSuggestion = { id: string; name: string; /** Active people in it who are not in the project yet. */ addable: number };

/**
 * Groups for the project's "add member" picker. Like the people search, nothing is listed without
 * a query unless `browse` is set. Only owners (who may add members) get an answer.
 */
export async function searchAddableGroups(
  db: DB,
  actor: Actor,
  projectId: string,
  rawQuery: string,
  opts: { browse?: boolean } = {},
): Promise<GroupSuggestion[]> {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.manageMembers", projectCtx(access.role));
  const query = rawQuery.trim().slice(0, 100);
  if (!query && !opts.browse) return [];
  const members = db.select({ id: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, projectId));
  const rows = await db
    .select({ id: userGroups.id, name: userGroups.name, addable: count(users.id) })
    .from(userGroups)
    .leftJoin(userGroupMembers, eq(userGroupMembers.groupId, userGroups.id))
    .leftJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true), notInArray(users.id, members)))
    .where(query ? ilike(userGroups.name, `%${escapeLike(query)}%`) : undefined)
    .groupBy(userGroups.id)
    .orderBy(asc(sql`lower(${userGroups.name})`))
    .limit(opts.browse ? 50 : 5);
  return rows;
}

/** Adds every active person of the group who is not in the project yet. Returns how many were added. */
export async function addGroupToProject(db: DB, actor: Actor, projectId: string, groupId: string, rawRole: ProjectRole): Promise<{ added: number }> {
  const role = z.enum(PROJECT_ROLES).safeParse(rawRole);
  if (!role.success) throw new DomainError("VALIDATION", "Unbekannte Rolle.");
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.manageMembers", projectCtx(access.role));
  await requireGroup(db, groupId);
  const people = await db
    .select({ id: users.id })
    .from(userGroupMembers)
    .innerJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true)))
    .where(eq(userGroupMembers.groupId, groupId));
  if (people.length === 0) return { added: 0 };
  const inserted = await db
    .insert(projectMembers)
    .values(people.map((person) => ({ projectId, userId: person.id, role: role.data })))
    .onConflictDoNothing()
    .returning({ userId: projectMembers.userId });
  return { added: inserted.length };
}
