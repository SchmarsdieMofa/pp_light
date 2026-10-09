import { and, asc, eq, ilike, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { GROUP_PROJECT_ROLES, PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import type { DB, Executor } from "@/server/db/client";
import {
  folderAccess,
  folderGroups,
  folderMembers,
  projectFolders,
  projects,
  userGroupMembers,
  userGroups,
  users,
} from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { pruneAssignees } from "@/server/projects/access-cleanup";
import { requireProjectAccess } from "@/server/projects/service";
import { assertCanFillFolder, requireFolderOwner, requireFolderRole } from "./access";
import { escapeLike } from "@/server/tasks/queries";
import { normalizeEmail } from "@/server/users/service";

const nameSchema = z.string().trim().min(1, "Bitte einen Namen eingeben.").max(80, "Der Name darf höchstens 80 Zeichen haben.");
const NO_ID = "00000000-0000-0000-0000-000000000000";
const asId = (id: string) => (z.uuid().safeParse(id).success ? id : NO_ID);

export type Folder = { id: string; name: string; /** The viewer's role in the folder. */ role: ProjectRole };

function parseName(raw: string): string {
  const parsed = nameSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("VALIDATION", parsed.error.issues[0].message);
  return parsed.data;
}

function parseRole(raw: string): ProjectRole {
  const role = z.enum(PROJECT_ROLES).safeParse(raw);
  if (!role.success) throw new DomainError("VALIDATION", "Unbekannte Rolle.");
  return role.data;
}

/** Like in projects, a whole group is never owner: whoever may edit the group must not make owners that way. */
function parseGroupRole(raw: string): ProjectRole {
  const role = z.enum(GROUP_PROJECT_ROLES).safeParse(raw);
  if (!role.success) throw new DomainError("VALIDATION", "Eine Gruppe kann im Ordner nur Mitglied oder Gast sein.");
  return role.data;
}

/** The folders the actor is in, by name. */
export async function listFolders(db: DB, actor: Actor): Promise<Folder[]> {
  return db
    .select({ id: projectFolders.id, name: projectFolders.name, role: folderAccess.role })
    .from(projectFolders)
    .innerJoin(folderAccess, and(eq(folderAccess.folderId, projectFolders.id), eq(folderAccess.userId, actor.id)))
    .orderBy(asc(sql`lower(${projectFolders.name})`));
}

/** Anyone may create a folder; they become its owner. */
export async function createFolder(db: DB, actor: Actor, rawName: string): Promise<{ id: string }> {
  const name = parseName(rawName);
  return db.transaction(async (tx) => {
    const [folder] = await tx.insert(projectFolders).values({ name, createdBy: actor.id }).returning({ id: projectFolders.id });
    await tx.insert(folderMembers).values({ folderId: folder.id, userId: actor.id, role: "owner" });
    return folder;
  });
}

export async function renameFolder(db: DB, actor: Actor, folderId: string, rawName: string): Promise<void> {
  const name = parseName(rawName);
  await requireFolderOwner(db, actor, folderId);
  await db.update(projectFolders).set({ name }).where(eq(projectFolders.id, folderId));
}

/** The projects stay (outside any folder); people who were in them only through the folder lose access. */
export async function deleteFolder(db: DB, actor: Actor, folderId: string): Promise<void> {
  await requireFolderOwner(db, actor, folderId);
  await db.transaction(async (tx) => {
    const inside = await tx.select({ id: projects.id }).from(projects).where(eq(projects.folderId, folderId));
    await tx.delete(projectFolders).where(eq(projectFolders.id, folderId));
    await pruneAssignees(tx, inside.map((project) => project.id));
  });
}

export type FolderMember = {
  id: string;
  name: string;
  email: string;
  /** What the person may do in the folder's projects: the highest role of their own membership and their groups. */
  role: ProjectRole;
  /** The person's own membership (null: they are in only through a group). */
  directRole: ProjectRole | null;
  groups: string[];
};
export type FolderGroup = { id: string; name: string; role: ProjectRole; size: number };
export type FolderDetail = {
  id: string;
  name: string;
  role: ProjectRole;
  members: FolderMember[];
  groups: FolderGroup[];
  projects: { id: string; name: string; key: string }[];
};

/** Everything the folder dialog shows. Any person in the folder may look; only owners change things. */
export async function getFolderDetail(db: DB, actor: Actor, folderId: string): Promise<FolderDetail> {
  const { folder, role } = await requireFolderRole(db, actor, folderId);
  const [people, direct, viaGroups, groupRows, inside] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, role: folderAccess.role })
      .from(folderAccess)
      .innerJoin(users, eq(users.id, folderAccess.userId))
      .where(eq(folderAccess.folderId, folder.id))
      .orderBy(asc(users.name), asc(users.email)),
    db.select({ userId: folderMembers.userId, role: folderMembers.role }).from(folderMembers).where(eq(folderMembers.folderId, folder.id)),
    db
      .select({ userId: userGroupMembers.userId, name: userGroups.name })
      .from(folderGroups)
      .innerJoin(userGroups, eq(userGroups.id, folderGroups.groupId))
      .innerJoin(userGroupMembers, eq(userGroupMembers.groupId, folderGroups.groupId))
      .where(eq(folderGroups.folderId, folder.id))
      .orderBy(asc(userGroups.name)),
    db
      .select({ id: userGroups.id, name: userGroups.name, role: folderGroups.role })
      .from(folderGroups)
      .innerJoin(userGroups, eq(userGroups.id, folderGroups.groupId))
      .where(eq(folderGroups.folderId, folder.id))
      .orderBy(asc(sql`lower(${userGroups.name})`)),
    db.select({ id: projects.id, name: projects.name, key: projects.key }).from(projects).where(eq(projects.folderId, folder.id)).orderBy(asc(projects.name)),
  ]);
  const groups = await Promise.all(
    groupRows.map(async (group) => {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(userGroupMembers)
        .innerJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true)))
        .where(eq(userGroupMembers.groupId, group.id));
      return { ...group, size: n };
    }),
  );
  return {
    id: folder.id,
    name: folder.name,
    role,
    members: people.map((person) => ({
      ...person,
      directRole: direct.find((row) => row.userId === person.id)?.role ?? null,
      groups: viaGroups.filter((row) => row.userId === person.id).map((row) => row.name),
    })),
    groups,
    // Everyone in the folder has access to all of its projects.
    projects: inside,
  };
}

async function assertAnotherOwner(ex: Executor, folderId: string, userId: string) {
  const owners = await ex
    .select({ userId: folderMembers.userId })
    .from(folderMembers)
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.role, "owner")))
    .for("update");
  if (!owners.some((owner) => owner.userId !== userId)) {
    throw new DomainError("VALIDATION", "Ein Ordner braucht mindestens einen Owner.");
  }
}

async function loadMembership(ex: Executor, folderId: string, userId: string) {
  const notFound = new DomainError("NOT_FOUND", "Mitglied nicht gefunden.");
  if (!z.uuid().safeParse(userId).success) throw notFound;
  const [row] = await ex
    .select()
    .from(folderMembers)
    .where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)))
    .limit(1);
  if (!row) throw notFound;
  return row;
}

async function folderProjectIds(ex: Executor, folderId: string): Promise<string[]> {
  const rows = await ex.select({ id: projects.id }).from(projects).where(eq(projects.folderId, folderId));
  return rows.map((row) => row.id);
}

export type FolderUserSuggestion = { id: string; name: string; email: string };
export type FolderGroupSuggestion = { id: string; name: string; size: number };

/** Active people not yet directly in the folder; nothing is listed without a query unless `browse` is set. */
export async function searchFolderUsers(db: DB, actor: Actor, folderId: string, rawQuery: string, opts: { browse?: boolean } = {}): Promise<FolderUserSuggestion[]> {
  await requireFolderOwner(db, actor, folderId);
  const query = rawQuery.trim().slice(0, 100);
  if (!query && !opts.browse) return [];
  const present = db.select({ id: folderMembers.userId }).from(folderMembers).where(eq(folderMembers.folderId, folderId));
  const conditions: (SQL | undefined)[] = [eq(users.active, true), notInArray(users.id, present)];
  if (query) {
    const like = `%${escapeLike(query)}%`;
    conditions.push(or(ilike(users.name, like), ilike(users.email, like)));
  }
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(...conditions))
    .orderBy(asc(users.name), asc(users.email))
    .limit(opts.browse ? 50 : 8);
}

export async function searchFolderGroups(db: DB, actor: Actor, folderId: string, rawQuery: string, opts: { browse?: boolean } = {}): Promise<FolderGroupSuggestion[]> {
  await requireFolderOwner(db, actor, folderId);
  const query = rawQuery.trim().slice(0, 100);
  if (!query && !opts.browse) return [];
  const present = db.select({ id: folderGroups.groupId }).from(folderGroups).where(eq(folderGroups.folderId, folderId));
  const found = await db
    .select({ id: userGroups.id, name: userGroups.name })
    .from(userGroups)
    .where(and(notInArray(userGroups.id, present), query ? ilike(userGroups.name, `%${escapeLike(query)}%`) : undefined))
    .orderBy(asc(sql`lower(${userGroups.name})`))
    .limit(opts.browse ? 50 : 5);
  return Promise.all(
    found.map(async (group) => {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(userGroupMembers)
        .innerJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true)))
        .where(eq(userGroupMembers.groupId, group.id));
      return { ...group, size: n };
    }),
  );
}

export async function addFolderMemberByEmail(db: DB, actor: Actor, folderId: string, email: string, rawRole: string): Promise<void> {
  const role = parseRole(rawRole);
  await requireFolderOwner(db, actor, folderId);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizeEmail(email)), eq(users.active, true)))
    .limit(1);
  if (!user) throw new DomainError("NOT_FOUND", "Kein aktiver Nutzer mit dieser E-Mail-Adresse.");
  const inserted = await db.insert(folderMembers).values({ folderId, userId: user.id, role }).onConflictDoNothing().returning({ id: folderMembers.userId });
  if (inserted.length === 0) throw new DomainError("VALIDATION", "Diese Person ist bereits im Ordner.");
}

export async function changeFolderMemberRole(db: DB, actor: Actor, folderId: string, userId: string, rawRole: string): Promise<void> {
  const role = parseRole(rawRole);
  await requireFolderOwner(db, actor, folderId);
  await db.transaction(async (tx) => {
    const membership = await loadMembership(tx, folderId, userId);
    if (membership.role === "owner" && role !== "owner") await assertAnotherOwner(tx, folderId, userId);
    await tx.update(folderMembers).set({ role }).where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)));
    // A lower role in the folder may take away what a project's task assignment needed; roles never remove access, so nothing to prune.
  });
}

export async function removeFolderMember(db: DB, actor: Actor, folderId: string, userId: string): Promise<void> {
  await requireFolderOwner(db, actor, folderId);
  await db.transaction(async (tx) => {
    const membership = await loadMembership(tx, folderId, userId);
    if (membership.role === "owner") await assertAnotherOwner(tx, folderId, userId);
    await tx.delete(folderMembers).where(and(eq(folderMembers.folderId, folderId), eq(folderMembers.userId, userId)));
    await pruneAssignees(tx, await folderProjectIds(tx, folderId));
  });
}

export async function addFolderGroup(db: DB, actor: Actor, folderId: string, groupId: string, rawRole: string): Promise<{ size: number }> {
  const role = parseGroupRole(rawRole);
  await requireFolderOwner(db, actor, folderId);
  const [group] = await db.select({ id: userGroups.id }).from(userGroups).where(eq(userGroups.id, asId(groupId))).limit(1);
  if (!group) throw new DomainError("NOT_FOUND", "Gruppe nicht gefunden.");
  const inserted = await db.insert(folderGroups).values({ folderId, groupId: group.id, role }).onConflictDoNothing().returning({ id: folderGroups.groupId });
  if (inserted.length === 0) throw new DomainError("VALIDATION", "Diese Gruppe ist schon im Ordner.");
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userGroupMembers)
    .innerJoin(users, and(eq(users.id, userGroupMembers.userId), eq(users.active, true)))
    .where(eq(userGroupMembers.groupId, group.id));
  return { size: n };
}

export async function changeFolderGroupRole(db: DB, actor: Actor, folderId: string, groupId: string, rawRole: string): Promise<void> {
  const role = parseGroupRole(rawRole);
  await requireFolderOwner(db, actor, folderId);
  const changed = await db
    .update(folderGroups)
    .set({ role })
    .where(and(eq(folderGroups.folderId, folderId), eq(folderGroups.groupId, asId(groupId))))
    .returning({ id: folderGroups.groupId });
  if (changed.length === 0) throw new DomainError("NOT_FOUND", "Diese Gruppe gehört nicht zum Ordner.");
}

export async function removeFolderGroup(db: DB, actor: Actor, folderId: string, groupId: string): Promise<void> {
  await requireFolderOwner(db, actor, folderId);
  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(folderGroups)
      .where(and(eq(folderGroups.folderId, folderId), eq(folderGroups.groupId, asId(groupId))))
      .returning({ id: folderGroups.groupId });
    if (removed.length === 0) throw new DomainError("NOT_FOUND", "Diese Gruppe gehört nicht zum Ordner.");
    await pruneAssignees(tx, await folderProjectIds(tx, folderId));
  });
}

/**
 * Moves a project into a folder or (folderId null) out of it. Needs the project's owner; into a folder
 * additionally owner or member of the folder, and out of its current folder (or into another one) an owner of
 * that folder – leaving ends the folder's access to the project, which only the folder's owners decide.
 * People who had access only through the old folder lose it.
 */
export async function moveProjectToFolder(db: DB, actor: Actor, projectId: string, folderId: string | null): Promise<void> {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.manageMembers", projectCtx(access.role));
  await db.transaction(async (tx) => {
    // Read under the row lock: two moves at once must not both pass the check against the same source folder.
    const [{ current }] = await tx.select({ current: projects.folderId }).from(projects).where(eq(projects.id, projectId)).for("update");
    if (current && current !== folderId) {
      const [membership] = await tx
        .select({ role: folderAccess.role })
        .from(folderAccess)
        .where(and(eq(folderAccess.folderId, current), eq(folderAccess.userId, actor.id)))
        .limit(1);
      if (membership?.role !== "owner") {
        throw new DomainError("FORBIDDEN", "Das Projekt liegt in einem Ordner – verschieben dürfen es nur Owner dieses Ordners.");
      }
    }
    if (folderId) await assertCanFillFolder(tx, actor, folderId);
    await tx.update(projects).set({ folderId }).where(eq(projects.id, projectId));
    await pruneAssignees(tx, [projectId]);
  });
}
