import { and, asc, eq, ilike, notInArray, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import type { DB, Executor } from "@/server/db/client";
import { projectMembers, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, projectCtx, type Actor } from "@/server/permissions";
import { pruneAssignees } from "@/server/projects/access-cleanup";
import { requireProjectAccess } from "@/server/projects/service";
import { escapeLike } from "@/server/tasks/queries";
import { normalizeEmail } from "@/server/users/service";

async function requireManage(db: DB, actor: Actor, projectId: string) {
  const access = await requireProjectAccess(db, actor, projectId);
  assertCan(actor, "project.manageMembers", projectCtx(access.role));
}

function parseRole(role: string): ProjectRole {
  const parsed = z.enum(PROJECT_ROLES).safeParse(role);
  if (!parsed.success) throw new DomainError("VALIDATION", "Unbekannte Rolle.");
  return parsed.data;
}

async function loadMembership(ex: Executor, projectId: string, userId: string) {
  const notFound = new DomainError("NOT_FOUND", "Mitglied nicht gefunden.");
  if (!z.uuid().safeParse(userId).success) throw notFound;
  const [row] = await ex
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!row) throw notFound;
  return row;
}

async function assertAnotherOwner(ex: Executor, projectId: string, userId: string) {
  const owners = await ex
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, "owner")))
    .for("update");
  if (!owners.some((o) => o.userId !== userId)) {
    throw new DomainError("VALIDATION", "Ein Projekt braucht mindestens einen Owner.");
  }
}

export type UserSuggestion = { id: string; name: string; email: string };

/**
 * Active users who are not yet in the project, for the "add member" picker. Without a query nothing
 * is listed (`browse` lifts that for the full picker), so the user list is never dumped unasked.
 */
export async function searchAddableUsers(
  db: DB,
  actor: Actor,
  projectId: string,
  rawQuery: string,
  opts: { browse?: boolean } = {},
): Promise<UserSuggestion[]> {
  await requireManage(db, actor, projectId);
  const query = rawQuery.trim().slice(0, 100);
  if (!query && !opts.browse) return [];
  const members = db.select({ id: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, projectId));
  const conditions: (SQL | undefined)[] = [eq(users.active, true), notInArray(users.id, members)];
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

export async function addMemberByEmail(db: DB, actor: Actor, projectId: string, email: string, role: ProjectRole): Promise<void> {
  const validRole = parseRole(role);
  await requireManage(db, actor, projectId);
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizeEmail(email)), eq(users.active, true)))
    .limit(1);
  if (!user) throw new DomainError("NOT_FOUND", "Kein aktiver Nutzer mit dieser E-Mail-Adresse.");
  const inserted = await db
    .insert(projectMembers)
    .values({ projectId, userId: user.id, role: validRole })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) throw new DomainError("VALIDATION", "Diese Person ist bereits Mitglied.");
}

export async function changeMemberRole(db: DB, actor: Actor, projectId: string, userId: string, role: ProjectRole): Promise<void> {
  const validRole = parseRole(role);
  await requireManage(db, actor, projectId);
  await db.transaction(async (tx) => {
    const membership = await loadMembership(tx, projectId, userId);
    if (membership.role === "owner" && validRole !== "owner") await assertAnotherOwner(tx, projectId, userId);
    await tx
      .update(projectMembers)
      .set({ role: validRole })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  });
}

export async function removeMember(db: DB, actor: Actor, projectId: string, userId: string): Promise<void> {
  await requireManage(db, actor, projectId);
  await db.transaction(async (tx) => {
    const membership = await loadMembership(tx, projectId, userId);
    if (membership.role === "owner") await assertAnotherOwner(tx, projectId, userId);
    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    // Still in through a group? Then the assignments stay.
    await pruneAssignees(tx, [projectId]);
  });
}
