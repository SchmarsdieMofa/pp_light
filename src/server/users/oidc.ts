import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/server/db/client";
import { authTokens, oidcAccounts, users } from "@/server/db/schema";
import { normalizeEmail } from "./service";

/**
 * Maps an OIDC login to a user. An already linked subject signs in directly. Linking or creating by e-mail
 * requires a verified address – from the `email_verified` claim or, for issuers that never send it
 * (e.g. Microsoft Entra ID), from `trustIssuerEmail` (OIDC_TRUST_EMAIL=true).
 */
export async function resolveOidcUser(
  db: DB,
  profile: { subject: string; email: string; name?: string; emailVerified: boolean },
  allowedDomains: string[],
  options: { trustIssuerEmail?: boolean } = {},
): Promise<string | null> {
  if (!profile.subject) return null;
  const [alreadyLinked] = await db
    .select({ id: users.id, active: users.active })
    .from(oidcAccounts)
    .innerJoin(users, eq(users.id, oidcAccounts.userId))
    .where(and(eq(oidcAccounts.provider, "oidc"), eq(oidcAccounts.subject, profile.subject)));
  if (alreadyLinked) return alreadyLinked.active ? alreadyLinked.id : null;
  if (!(profile.emailVerified || options.trustIssuerEmail) || !profile.email) return null;
  const email = normalizeEmail(profile.email);
  if (!z.email().safeParse(email).success) return null;
  const domain = email.split("@")[1];
  if (!domain) return null;
  return db.transaction(async (tx) => {
    const [linked] = await tx.select({ id: users.id, active: users.active }).from(oidcAccounts)
      .innerJoin(users, eq(users.id, oidcAccounts.userId))
      .where(and(eq(oidcAccounts.provider, "oidc"), eq(oidcAccounts.subject, profile.subject)));
    if (linked) return linked.active ? linked.id : null;

    const [existing] = await tx.select().from(users).where(eq(users.email, email));
    let user = existing;
    if (user && !user.active) {
      const [invitation] = await tx.select({ hash: authTokens.tokenHash }).from(authTokens)
        .where(and(eq(authTokens.userId, user.id), eq(authTokens.kind, "invite"),
          isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())));
      if (!invitation) return null;
      await tx.update(users).set({ active: true }).where(eq(users.id, user.id));
      await tx.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.tokenHash, invitation.hash));
    } else if (!user) {
      if (!allowedDomains.includes(domain)) return null;
      [user] = await tx.insert(users).values({ email, name: profile.name?.trim() || email.split("@")[0] }).returning();
    }
    if (!user) return null;
    await tx.insert(oidcAccounts).values({ provider: "oidc", subject: profile.subject, userId: user.id });
    return user.id;
  });
}
