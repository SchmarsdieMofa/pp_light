import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";
import { loginSchema } from "@/lib/schemas/auth";
import { db } from "@/server/db/client";
import { verifyCredentials } from "@/server/users/service";
import { resolveOidcUser } from "@/server/users/oidc";

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
      async authorize(raw) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await verifyCredentials(db(), parsed.data.email, parsed.data.password);
        return user ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
    ...oidcProvider,
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "oidc") return true;
      const id = await resolveOidcUser(db(), {
        subject: String(profile?.sub ?? ""), email: String(profile?.email ?? ""),
        name: profile?.name ?? undefined, emailVerified: profile?.email_verified === true,
      }, (process.env.OIDC_ALLOWED_DOMAINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
      if (!id) return false;
      user.id = id;
      return true;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
