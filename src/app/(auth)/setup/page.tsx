import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { hasSetupCode, hasUsers, issueSetupCode } from "@/server/setup/service";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasUsers(db())) redirect("/login");
  // The container prints a code at start; without one (e.g. `next dev`) it is made here and logged.
  if (!(await hasSetupCode(db()))) {
    const code = await issueSetupCode(db());
    if (code) console.log(`\n  pp_light Einrichtungscode: ${code}\n`);
  }
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">pp_light einrichten</h1>
          <p className="text-sm text-muted-foreground">Lege das erste Konto an. Es bekommt Admin-Rechte.</p>
        </div>
        <SetupForm />
      </div>
    </main>
  );
}
