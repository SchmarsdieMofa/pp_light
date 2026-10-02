"use client";

import { useState } from "react";
import { toast } from "sonner";
import { logoutAction } from "@/app/(app)/actions";
import { changeOwnPasswordAction, updateOwnNameAction } from "@/app/(app)/settings/actions";
import { AutosaveInput, useRunner } from "@/components/projects/settings-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm(props: { name: string; email: string }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr] sm:items-center">
      <dt><label htmlFor="own-name" className="text-muted-foreground">Name</label></dt>
      <dd className="-mx-2">
        <AutosaveInput id="own-name" label="Name" value={props.name} required maxLength={100} onSave={updateOwnNameAction} />
      </dd>
      <dt className="text-muted-foreground">E-Mail</dt>
      <dd>{props.email}</dd>
    </dl>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const { pending, run } = useRunner();
  const mismatch = repeat.length > 0 && next !== repeat;
  return (
    <form
      aria-label="Passwort ändern"
      className="grid max-w-sm gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (next !== repeat) return;
        run(
          () => changeOwnPasswordAction(current, next),
          async () => {
            toast.success("Passwort geändert – bitte melde dich neu an.");
            await logoutAction();
          },
        );
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Aktuelles Passwort</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-next">Neues Passwort</Label>
        <Input id="pw-next" type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="text-xs text-muted-foreground">Mindestens zwölf Zeichen.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-repeat">Neues Passwort wiederholen</Label>
        <Input id="pw-repeat" type="password" autoComplete="new-password" required value={repeat} aria-invalid={mismatch} onChange={(e) => setRepeat(e.target.value)} />
        {mismatch && <p className="text-xs text-destructive">Die Passwörter stimmen nicht überein.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Danach wirst du auf allen Geräten abgemeldet.</p>
      <Button type="submit" className="justify-self-start" disabled={pending || mismatch || next.length < 12}>
        Passwort ändern
      </Button>
    </form>
  );
}
