import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/server/db/client";
import { projectGroups, projects, userGroupMembers, userGroups, users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";
import { pruneAssignees } from "@/server/projects/access-cleanup";

const nameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(80, "Der Name darf höchstens 80 Zeichen haben.");

export type GroupRow = {
  id: string;
  name: string;
  members: { id: string; name: string; email: string; active: boolean }[];
  /** Projects the group is part of: its people have access there. */
  projects: { id: string; name: string }[];
};

function requireGroupManager(actor: Actor) {
  assertCan(actor, "groups.manage");
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

/** All groups with their people and projects, for the admin screen. */
export async function listGroups(db: DB, actor: Actor): Promise<GroupRow[]> {
  requireGroupManager(actor);
  const groups = await db.select().from(userGroups).orderBy(asc(sql`lower(${userGroups.name})`));
  if (groups.length === 0) return [];
  const [rows, links] = await Promise.all([
    db
      .select({ groupId: userGroupMembers.groupId, id: users.id, name: users.name, email: users.email, active: users.active })
      .from(userGroupMembers)
      .innerJoin(users, eq(users.id, userGroupMembers.userId))
      .orderBy(asc(users.name), asc(users.email)),
    db
      .select({ groupId: projectGroups.groupId, id: projects.id, name: projects.name })
      .from(projectGroups)
      .innerJoin(projects, eq(projects.id, projectGroups.projectId))
      .orderBy(asc(projects.name)),
  ]);
  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    members: rows.filter((row) => row.groupId === group.id).map(({ id, name, email, active }) => ({ id, name, email, active })),
    projects: links.filter((link) => link.groupId === group.id).map(({ id, name }) => ({ id, name })),
  }));
}

export async function createGroup(db: DB, actor: Actor, rawName: string): Promise<{ id: string }> {
  requireGroupManager(actor);
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
  requireGroupManager(actor);
  const name = parseName(rawName);
  await requireGroup(db, groupId);
  try {
    await db.update(userGroups).set({ name }).where(eq(userGroups.id, groupId));
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", `Es gibt schon eine Gruppe „${name}“.`);
    throw err;
  }
}

/** The projects a group is part of. */
async function linkedProjects(ex: DB | Parameters<Parameters<DB["transaction"]>[0]>[0], groupId: string): Promise<string[]> {
  const rows = await ex.select({ id: projectGroups.projectId }).from(projectGroups).where(eq(projectGroups.groupId, groupId));
  return rows.map((row) => row.id);
}

/** Deleting a group takes its access away: people who are in a project only through it lose it. */
export async function deleteGroup(db: DB, actor: Actor, groupId: string): Promise<void> {
  requireGroupManager(actor);
  await requireGroup(db, groupId);
  await db.transaction(async (tx) => {
    const linked = await linkedProjects(tx, groupId);
    await tx.delete(userGroups).where(eq(userGroups.id, groupId));
    await pruneAssignees(tx, linked);
  });
}

/** Someone in the group gets access to the group's projects at once. */
export async function addGroupMember(db: DB, actor: Actor, groupId: string, userId: string): Promise<void> {
  requireGroupManager(actor);
  await requireGroup(db, groupId);
  const [user] = z.uuid().safeParse(userId).success ? await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1) : [];
  if (!user) throw new DomainError("NOT_FOUND", "Person nicht gefunden.");
  await db.insert(userGroupMembers).values({ groupId, userId }).onConflictDoNothing();
}

/** …and loses it at once when taken out again. */
export async function removeGroupMember(db: DB, actor: Actor, groupId: string, userId: string): Promise<void> {
  requireGroupManager(actor);
  await requireGroup(db, groupId);
  if (!z.uuid().safeParse(userId).success) return;
  await db.transaction(async (tx) => {
    await tx.delete(userGroupMembers).where(and(eq(userGroupMembers.groupId, groupId), eq(userGroupMembers.userId, userId)));
    await pruneAssignees(tx, await linkedProjects(tx, groupId));
  });
}
