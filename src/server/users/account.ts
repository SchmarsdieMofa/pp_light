import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { GLOBAL_ROLES, type GlobalRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { LOGIN_LIMITS, clearFailures, emailKey, lockedFor, recordFailure } from "@/server/auth/throttle";
import type { DB } from "@/server/db/client";
import { authTokens, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";

export const ownNameSchema = z.string().trim().min(1, "Name fehlt").max(100, "Höchstens 100 Zeichen");

export async function updateOwnName(db: DB, actor: Actor, raw: string): Promise<void> {
  const name = ownNameSchema.parse(raw);
  await db.update(users).set({ name }).where(eq(users.id, actor.id));
}

/** Whether the actor can change a password here (SSO-only accounts have none). */
export async function hasPassword(db: DB, actor: Actor): Promise<boolean> {
  const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  return !!row?.hash;
}

/**
 * Changes the actor's password after checking the current one. Wrong guesses count towards the login lock.
 * Bumps the session version, so every session – including this one – has to sign in again.
 */
export async function changeOwnPassword(db: DB, actor: Actor, current: string, next: string, now = new Date()): Promise<void> {
  if (next.length < 12) throw new DomainError("VALIDATION", "Das neue Passwort braucht mindestens zwölf Zeichen.");
  if (next.length > 200) throw new DomainError("VALIDATION", "Das neue Passwort ist zu lang.");
  const key = emailKey(actor.email);
  if (await lockedFor(db, [key], now)) {
    throw new DomainError("FORBIDDEN", "Zu viele Fehlversuche – bitte später erneut versuchen.");
  }
  const [user] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
  if (!user?.hash) throw new DomainError("VALIDATION", "Dein Konto meldet sich über Single Sign-on an und hat kein Passwort.");
  if (!(await verifyPassword(user.hash, current))) {
    await recordFailure(db, key, LOGIN_LIMITS.email, now);
    throw new DomainError("VALIDATION", "Das aktuelle Passwort stimmt nicht.");
  }
  await clearFailures(db, key);
  const passwordHash = await hashPassword(next);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, actor.id));
    // Open reset links were meant for the old password.
    await tx.delete(authTokens).where(and(eq(authTokens.userId, actor.id), eq(authTokens.kind, "reset")));
  });
}

/** Admins change other people's global role; their own stays, so there is always an admin left. */
export async function setUserRole(db: DB, actor: Actor, userId: string, raw: GlobalRole): Promise<void> {
  assertCan(actor, "admin.manageUsers");
  const role = z.enum(GLOBAL_ROLES).parse(raw);
  if (userId === actor.id) throw new DomainError("VALIDATION", "Du kannst deine eigene Rolle nicht ändern.");
  if (!z.uuid().safeParse(userId).success) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
  const changed = await db.update(users).set({ role }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!changed.length) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
}
