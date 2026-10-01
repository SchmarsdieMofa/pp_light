import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/server/db/client";
import { authTokens, mailOutbox, users } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { assertCan, type Actor } from "@/server/permissions";
import { hashPassword } from "@/server/auth/password";
import { sealMailBody } from "@/server/mail/crypto";
import { normalizeEmail } from "./service";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const baseUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function listUsers(db: DB, actor: Actor) {
  assertCan(actor, "admin.manageUsers");
  return db.select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
    .from(users).orderBy(users.email);
}

export async function inviteUser(db: DB, actor: Actor, raw: { email: string; name: string; role: "admin" | "member" }) {
  assertCan(actor, "admin.manageUsers");
  const email = normalizeEmail(raw.email);
  const name = raw.name.trim();
  if (!z.email().safeParse(email).success || !name || name.length > 100) {
    throw new DomainError("VALIDATION", "Ein gültiger Name und eine gültige E-Mail sind erforderlich.");
  }
  const token = newToken();
  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    if (existing?.active) throw new DomainError("EMAIL_TAKEN", "Dieses Konto ist bereits aktiv.");
    const [user] = existing ? [existing] : await tx.insert(users).values({ email, name, role: raw.role, active: false }).returning();
    if (existing) await tx.update(users).set({ name, role: raw.role }).where(eq(users.id, user.id));
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "invite")));
    await tx.insert(authTokens).values({ tokenHash: hashToken(token), userId: user.id, kind: "invite",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) });
    await tx.insert(mailOutbox).values({ toEmail: email, subject: "Einladung zu pp_light",
      body: sealMailBody(`Hallo ${name},\n\nsetze dein Passwort über diesen Link:\n${baseUrl()}/invite/${token}\n\nDer Link ist sieben Tage gültig.`) });
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
  await db.transaction(async (tx) => {
    await tx.delete(authTokens).where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "reset")));
    await tx.insert(authTokens).values({ tokenHash: hashToken(token), userId: user.id, kind: "reset",
      expiresAt: new Date(Date.now() + 60 * 60_000) });
    await tx.insert(mailOutbox).values({ toEmail: email, subject: "Passwort für pp_light zurücksetzen",
      body: sealMailBody(`Setze dein Passwort über diesen Link:\n${baseUrl()}/reset/${token}\n\nDer Link ist eine Stunde gültig.`) });
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
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const [token] = await tx.update(authTokens).set({ usedAt: new Date() })
      .where(and(eq(authTokens.tokenHash, hashToken(rawToken)), eq(authTokens.kind, kind),
        isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
      .returning({ userId: authTokens.userId });
    if (!token) throw new DomainError("VALIDATION", "Dieser Link ist ungültig oder abgelaufen.");
    await tx.update(users).set({ passwordHash, active: true }).where(eq(users.id, token.userId));
  });
}

export async function setUserActive(db: DB, actor: Actor, userId: string, active: boolean): Promise<void> {
  assertCan(actor, "admin.manageUsers");
  if (actor.id === userId && !active) throw new DomainError("VALIDATION", "Du kannst dein eigenes Konto nicht deaktivieren.");
  const changed = await db.update(users).set({ active }).where(eq(users.id, userId)).returning({ id: users.id });
  if (!changed.length) throw new DomainError("NOT_FOUND", "Nutzer nicht gefunden.");
}
