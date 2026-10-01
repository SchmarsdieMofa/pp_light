"use client";

import { useActionState } from "react";
import { requestResetAction, type AuthFormState } from "@/app/(auth)/reset/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RequestResetForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(requestResetAction, {});
  return <form action={action} className="space-y-3">
    <Input type="email" name="email" aria-label="E-Mail" autoComplete="email" required />
    {state.done && <p role="status" className="text-sm">Falls ein Konto besteht, wurde der Link vorgemerkt.</p>}
    <Button type="submit" disabled={pending} className="w-full">Link anfordern</Button>
  </form>;
}
