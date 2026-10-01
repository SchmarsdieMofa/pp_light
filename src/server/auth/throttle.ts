import { eq, sql } from "drizzle-orm";
import type { DB } from "@/server/db/client";
import { loginAttempts } from "@/server/db/schema";

export const LOGIN_LIMITS = {
  /** failures per e-mail before the account is locked */
  email: 5,
  /** failures per client IP (across accounts) before that IP is locked */
  ip: 20,
  windowMinutes: 15,
  lockMinutes: 15,
} as const;

export const emailKey = (email: string) => `email:${email}`;
export const ipKey = (ip: string) => `ip:${ip}`;

/** Seconds until the first locked key unlocks, or 0 if none is locked. */
export async function lockedFor(db: DB, keys: string[], now: Date): Promise<number> {
  let longest = 0;
  for (const key of keys) {
    const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
    if (row?.lockedUntil && row.lockedUntil > now) {
      longest = Math.max(longest, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000));
    }
  }
  return longest;
}

/** Counts a failure; failures older than the window start a new count. Locks once the threshold is reached. */
export async function recordFailure(db: DB, key: string, threshold: number, now: Date): Promise<void> {
  const windowStart = new Date(now.getTime() - LOGIN_LIMITS.windowMinutes * 60_000);
  const lockUntil = new Date(now.getTime() + LOGIN_LIMITS.lockMinutes * 60_000);
  await db
    .insert(loginAttempts)
    .values({ key, failures: 1, updatedAt: now, lockedUntil: threshold <= 1 ? lockUntil : null })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        failures: sql`case when ${loginAttempts.updatedAt} < ${windowStart} then 1 else ${loginAttempts.failures} + 1 end`,
        lockedUntil: sql`case when (case when ${loginAttempts.updatedAt} < ${windowStart} then 1 else ${loginAttempts.failures} + 1 end) >= ${threshold} then ${lockUntil} else ${loginAttempts.lockedUntil} end`,
        updatedAt: now,
      },
    });
}

export async function clearFailures(db: DB, key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}
