import { SetPasswordForm } from "@/components/auth/set-password-form";
import { db } from "@/server/db/client";
import { tokenIsValid } from "@/server/users/invitations";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await tokenIsValid(db(), token, "invite");
  return <main className="flex min-h-svh items-center justify-center p-4"><div className="w-full max-w-sm space-y-5">
    <h1 className="text-2xl font-semibold">Einladung annehmen</h1>
    {valid ? <SetPasswordForm kind="invite" token={token} /> : <p>Dieser Link ist ungültig oder abgelaufen.</p>}
  </div></main>;
}
