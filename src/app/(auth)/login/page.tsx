import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Only an *active* user is sent on – a deactivated user with a stale cookie stays here (no loop).
  if (await getActor()) redirect("/");
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold">pp_light</h1>
        <LoginForm />
        {process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET && (
          <form action={async () => { "use server"; const { signIn } = await import("@/auth"); await signIn("oidc", { redirectTo: "/" }); }}>
            <button type="submit" className="w-full rounded-md border px-4 py-2 text-sm hover:bg-accent">Mit Single Sign-On anmelden</button>
          </form>
        )}
        <Link href="/reset" className="block text-sm underline">Passwort vergessen?</Link>
      </div>
    </main>
  );
}
