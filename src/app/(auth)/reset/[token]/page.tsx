import { SetPasswordForm } from "@/components/auth/set-password-form";
import { db } from "@/server/db/client";
import { tokenIsValid } from "@/server/users/invitations";

export default async function ResetTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await tokenIsValid(db(), token, "reset");
  return <main className="flex min-h-svh items-center justify-center p-4"><div className="w-full max-w-sm space-y-5">
    <h1 className="text-2xl font-semibold">Neues Passwort</h1>
    {valid ? <SetPasswordForm kind="reset" token={token} /> : <p>Dieser Link ist ungültig oder abgelaufen.</p>}
  </div></main>;
}
