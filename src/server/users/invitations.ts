import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB, Executor } from "@/server/db/client";
import { authTokens, mailOutbox, projectMembers, userGroupMembers, userGroups, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import type { GlobalRole } from "@/lib/enums";
import { assertCan, canAssignRole, canManageUser, type Actor } from "@/server/permissions";
import { hashPassword } from "@/server/auth/password";
import { sealMailBody } from "@/server/mail/crypto";
import { getBaseUrl } from "@/server/settings/service";
import { normalizeEmail } from "./service";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export type UserListRow = {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  active: boolean;
  /** Not active yet, but a valid invitation link is out. */
  invited: boolean;
  groups: string[];
  projectCount: number;
};

export async function listUsers(db: DB, actor: Actor): Promise<UserListRow[]> {
  assertCan(actor, "users.manage");
  const [rows, invites, groupRows, projectRows] = await Promise.all([
    db.select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
      .from(users).orderBy(users.email),
    db.select({ userId: authTokens.userId }).from(authTokens)
      .where(and(eq(authTokens.kind, "invite"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()))),
    db.select({ userId: userGroupMembers.userId, name: userGroups.name }).from(userGroupMembers)
      .innerJoin(userGroups, eq(userGroups.id, userGroupMembers.groupId)).orderBy(sql`lower(${userGroups.name})`),
    db.select({ userId: projectMembers.userId, n: count() }).from(projectMembers).groupBy(projectMembers.userId),
  ]);
  const invited = new Set(invites.map((row) => row.userId));
  return rows.map((row) => ({
    ...row,
    invited: !row.active && invited.has(row.id),
    groups: groupRows.filter((group) => group.userId === row.id).map((group) => group.name),
    projectCount: projectRows.find((project) => project.userId === row.id)?.n ?? 0,
  }));
}

export async function inviteUser(db: DB, actor: Actor, raw: { email: string; name: string; role: GlobalRole }) {
  assertCan(actor, "users.manage");
  if (!canAssignRole(actor, raw.role)) {
    throw new DomainError("FORBIDDEN", "Diese Rolle darfst du nicht vergeben.");
  }
  const email = normalizeEmail(raw.email);
  const name = raw.name.trim();
  if (!z.email().safeParse(email).success || !name || name.length > 100) {
    throw new DomainError("VALIDATION", "Ein gültiger Name und eine gültige E-Mail sind erforderlich.");
  }
  const token = newToken();
  const baseUrl = await getBaseUrl(db);
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (existing?.active) throw new DomainError("EMAIL_TAKEN", "Dieses Konto ist bereits aktiv.");
    // A re-invitation rewrites name and role of the account: not for accounts the actor may not manage.
    if (existing && !canManageUser(actor, existing.role)) throw new DomainError("FORBIDDEN", "Dieses Konto darfst du nicht ändern.");
    const [user] = existing ? [existing] : await tx.insert(users).values({ email, name, role: raw.role, active: false }).returning();
    if (existing) await tx.update(users).set({ name, role: raw.role }).where(eq(users.id, user.id));
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "invite")));
    await tx.insert(authTokens).values({ tokenHash: hashToken(token), userId: user.id, kind: "invite",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) });
    await tx.insert(mailOutbox).values({ toEmail: email, subject: "Einladung zu pp_light",
      body: sealMailBody(`Hallo ${name},\n\nsetze dein Passwort über diesen Link:\n${baseUrl}/invite/${token}\n\nDer Link ist sieben Tage gültig.`) });
  });
}

export async function requestPasswordReset(db: DB, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  const [user] = await db.select().from(users).where(and(eq(users.email, email), eq(users.active, true)));
  if (!user) return;
  const [recent] = await db.select({ hash: authTokens.tokenHash }).from(authTokens)
    .where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "reset"), isNull(authTokens.usedAt),
      gt(authTokens.createdAt, new Date(Date.now() - 5 * 60_000))));
  if (recent) return;
  const token = newToken();
  const baseUrl = await getBaseUrl(db);
  await db.transaction(async (tx) => {
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "reset")));
    await tx.insert(authTokens).values({ tokenHash: hashToken(token), userId: user.id, kind: "reset",
      expiresAt: new Date(Date.now() + 60 * 60_000) });
    await tx.insert(mailOutbox).values({ toEmail: email, subject: "Passwort für pp_light zurücksetzen",
      body: sealMailBody(`Setze dein Passwort über diesen Link:\n${baseUrl}/reset/${token}\n\nDer Link ist eine Stunde gültig.`) });
  });
}

export async function tokenIsValid(db: DB, rawToken: string, kind: "invite" | "reset"): Promise<boolean> {
  if (!/^[\w-]{43}$/.test(rawToken)) return false;
  const [row] = await db.select({ hash: authTokens.tokenHash }).from(authTokens)
    .where(and(eq(authTokens.tokenHash, hashToken(rawToken)), eq(authTokens.kind, kind),
      isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
  return Boolean(row);
}

export async function consumeAuthToken(db: DB, rawToken: string, kind: "invite" | "reset", password: string): Promise<void> {
  if (!/^[\w-]{43}$/.test(rawToken) || password.length < 12) {
    throw new DomainError("VALIDATION", "Ungültiger Link oder Passwort mit weniger als zwölf Zeichen.");
  }
  // Cheap check first: anonymous requests with made-up tokens must not trigger argon2 work.
  if (!(await tokenIsValid(db, rawToken, kind))) throw new DomainError("VALIDATION", "Dieser Link ist ungültig oder abgelaufen.");
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [token] = await tx.update(authTokens).set({ usedAt: new Date() })
      .where(and(eq(authTokens.tokenHash, hashToken(rawToken)), eq(authTokens.kind, kind),
        isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .returning({ userId: authTokens.userId });
    if (!token) throw new DomainError("VALIDATION", "Dieser Link ist ungültig oder abgelaufen.");
    // Only an invitation activates an account; a reset must never undo a deactivation.
    const updated = await tx
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, ...(kind === "invite" ? { active: true } : {}) })
      .where(kind === "invite" ? eq(users.id, token.userId) : and(eq(users.id, token.userId), eq(users.active, true)))
      .returning({ id: users.id });
    if (!updated.length) throw new DomainError("VALIDATION", "Dieser Link ist ungültig oder abgelaufen.");
  });
}

/** NOT_FOUND for an unknown account; FORBIDDEN unless the actor may manage that kind of account. */
async function requireManageableUser(ex: Executor, actor: Actor, userId: string): Promise<void> {
  const [target] = z.uuid().safeParse(userId).success
    ? await ex.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1)
    : [];
  if (!target) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
  if (!canManageUser(actor, target.role)) throw new DomainError("FORBIDDEN", "Dieses Konto darfst du nicht ändern.");
}

export async function setUserActive(db: DB, actor: Actor, userId: string, active: boolean): Promise<void> {
  assertCan(actor, "users.manage");
  if (actor.id === userId && !active) throw new DomainError("VALIDATION", "Du kannst dein eigenes Konto nicht deaktivieren.");
  await db.transaction(async (tx) => {
    await requireManageableUser(tx, actor, userId);
    const changed = await tx.update(users).set({ active }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!changed.length) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
    // Open reset/invite links would otherwise let a deactivated person back in.
    if (!active) await tx.delete(authTokens).where(eq(authTokens.userId, userId));
  });
}

/** Withdraws a pending invitation; the account stays inactive. */
export async function revokeInvitation(db: DB, actor: Actor, userId: string): Promise<void> {
  assertCan(actor, "users.manage");
  await requireManageableUser(db, actor, userId);
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.kind, "invite")));
}
