import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { GlobalRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { DB, Executor } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { DomainError, isUniqueViolation } from "@/server/errors";

export type User = typeof users.$inferSelect;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(
  db: Executor,
  input: { email: string; name: string; password?: string; role?: GlobalRole },
): Promise<User> {
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  try {
    const [user] = await db
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        name: input.name.trim(),
        passwordHash,
        role: input.role ?? "member",
      })
      .returning();
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new DomainError("EMAIL_TAKEN", "Diese E-Mail-Adresse ist bereits vergeben.");
    }
    throw err;
  }
}

let dummyHash: Promise<string> | undefined;

/** Returns the user if email+password match an active account; null otherwise. */
export async function verifyCredentials(db: DB, email: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  if (!user || !user.passwordHash || !user.active) {
    // Same work as a real check, so response time does not reveal which emails exist.
    dummyHash ??= hashPassword("dummy-password-for-timing");
    await verifyPassword(await dummyHash, password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

export async function findActiveUser(db: DB, id: string): Promise<User | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.active, true)))
    .limit(1);
  return user ?? null;
}
