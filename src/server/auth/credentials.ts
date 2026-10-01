import { loginSchema } from "@/lib/schemas/auth";
import type { DB } from "@/server/db/client";
import { normalizeEmail, verifyCredentials, type User } from "@/server/users/service";
import { clearFailures, emailKey, ipKey, LOGIN_LIMITS, lockedFor, recordFailure } from "./throttle";

export type CredentialsResult = { user: User } | { locked: true; retryAfterSeconds: number } | null;

/**
 * Password login with brute-force protection: an account locks after 5 failures, an IP after 20
 * (both for 15 minutes). A locked account stays locked even for the correct password.
 */
export async function authorizeCredentials(db: DB, raw: unknown, ip: string, now = new Date()): Promise<CredentialsResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return null;
  const email = normalizeEmail(parsed.data.email);
  const keys = [emailKey(email), ipKey(ip)];
  const retryAfterSeconds = await lockedFor(db, keys, now);
  if (retryAfterSeconds > 0) return { locked: true, retryAfterSeconds };

  const user = await verifyCredentials(db, email, parsed.data.password);
  if (!user) {
    await recordFailure(db, emailKey(email), LOGIN_LIMITS.email, now);
    await recordFailure(db, ipKey(ip), LOGIN_LIMITS.ip, now);
    return null;
  }
  await clearFailures(db, emailKey(email));
  return { user };
}

/** Client IP for throttling; the first X-Forwarded-For hop when behind a proxy. */
export function clientIp(headers: Headers | undefined): string {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers?.get("x-real-ip") || "unknown";
}
