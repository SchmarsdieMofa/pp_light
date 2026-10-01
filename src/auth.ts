import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { authorizeCredentials, clientIp } from "@/server/auth/credentials";
import { db } from "@/server/db/client";
import { findActiveUser } from "@/server/users/service";
import { resolveOidcUser } from "@/server/users/oidc";

/** Signals a temporary lock (too many failed logins) to the login form. */
export class LoginLockedError extends CredentialsSignin {
  code = "locked";
}

const oidcEnabled = Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);
const oidcProvider: Provider[] = oidcEnabled ? [{
  id: "oidc", name: "Single Sign-On", type: "oidc",
  issuer: process.env.OIDC_ISSUER!, clientId: process.env.OIDC_CLIENT_ID!, clientSecret: process.env.OIDC_CLIENT_SECRET!,
}] : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-Mail" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(raw, request) {
        const result = await authorizeCredentials(db(), raw, clientIp(request?.headers));
        if (result && "locked" in result) throw new LoginLockedError();
        return result ? { id: result.user.id, email: result.user.email, name: result.user.name } : null;
      },
    }),
    ...oidcProvider,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "oidc") return true;
      const claim: unknown = profile?.email_verified;
      const verified = claim === true || claim === "true";
      const id = await resolveOidcUser(db(), {
        subject: String(profile?.sub ?? ""), email: String(profile?.email ?? ""),
        name: profile?.name ?? undefined, emailVerified: verified,
      }, (process.env.OIDC_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
      { trustIssuerEmail: process.env.OIDC_TRUST_EMAIL === "true" });
      if (!id) return false;
      user.id = id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        // Remember the password generation at login; a later reset invalidates this session.
        token.sv = (await findActiveUser(db(), user.id))?.sessionVersion ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      (session as typeof session & { sv?: number }).sv = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
});
