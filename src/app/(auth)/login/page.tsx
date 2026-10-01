import { redirect } from "next/navigation";
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
      </div>
    </main>
  );
}
