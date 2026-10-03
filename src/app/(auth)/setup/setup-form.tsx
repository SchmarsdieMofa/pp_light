"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setupAction, type SetupState } from "./actions";

function Field(props: { id: string; label: string; hint?: string } & React.ComponentProps<typeof Input>) {
  const { id, label, hint, ...input } = props;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} required aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SetupForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(setupAction, {});
  return (
    // Remount on every answer so the refilled default values take effect.
    <form key={JSON.stringify(state)} action={formAction} className="space-y-4">
      <Field
        id="code"
        label="Einrichtungscode"
        defaultValue={state.values?.code}
        autoComplete="off"
        spellCheck={false}
        placeholder="ABCD-EFGH"
        className="font-mono uppercase"
        hint="Steht im Log des Servers: docker compose logs app"
      />
      <Field id="name" label="Name" defaultValue={state.values?.name} autoComplete="name" maxLength={100} />
      <Field id="email" label="E-Mail" defaultValue={state.values?.email} type="email" autoComplete="email" />
      <Field id="password" label="Passwort" type="password" autoComplete="new-password" minLength={12} hint="Mindestens 12 Zeichen." />
      <Field id="repeat" label="Passwort wiederholen" type="password" autoComplete="new-password" minLength={12} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        Einrichten
      </Button>
    </form>
  );
}
