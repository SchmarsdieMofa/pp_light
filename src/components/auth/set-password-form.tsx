"use client";

import { useActionState, useId } from "react";
import { setPasswordAction, type AuthFormState } from "@/app/(auth)/reset/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetPasswordForm({ kind, token }: { kind: "invite" | "reset"; token: string }) {
  const id = useId();
  const bound = setPasswordAction.bind(null, kind, token);
  const [state, action, pending] = useActionState<AuthFormState, FormData>(bound, {});
  return <form action={action} className="space-y-3">
    <div className="space-y-2">
      <Label htmlFor={`${id}-password`}>Neues Passwort</Label>
      <Input id={`${id}-password`} type="password" name="password" aria-describedby={`${id}-hint`} autoComplete="new-password" minLength={12} required />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">Mindestens 12 Zeichen.</p>
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${id}-repeat`}>Passwort wiederholen</Label>
      <Input id={`${id}-repeat`} type="password" name="repeat" autoComplete="new-password" minLength={12} required />
    </div>
    {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    <Button type="submit" className="w-full" disabled={pending}>Passwort speichern</Button>
  </form>;
}
