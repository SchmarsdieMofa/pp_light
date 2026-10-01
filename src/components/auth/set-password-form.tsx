"use client";

import { useActionState } from "react";
import { setPasswordAction, type AuthFormState } from "@/app/(auth)/reset/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SetPasswordForm({ kind, token }: { kind: "invite" | "reset"; token: string }) {
  const bound = setPasswordAction.bind(null, kind, token);
  const [state, action, pending] = useActionState<AuthFormState, FormData>(bound, {});
  return <form action={action} className="space-y-3">
    <Input type="password" name="password" aria-label="Neues Passwort" autoComplete="new-password" minLength={12} required />
    <Input type="password" name="repeat" aria-label="Passwort wiederholen" autoComplete="new-password" minLength={12} required />
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" className="w-full" disabled={pending}>Passwort speichern</Button>
  </form>;
}
