"use client";

import { Select } from "@/components/ui/select";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUserAction, revokeInvitationAction, setUserActiveAction, setUserRoleAction } from "@/app/(app)/settings/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type UserRow = { id: string; email: string; name: string; role: "admin" | "member"; active: boolean };

const ROLE_OPTIONS = [{ value: "member", label: "Mitglied" }, { value: "admin", label: "Admin" }];

export function AdminUsers({ users, ownId }: { users: UserRow[]; ownId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRow["role"]>("member");

  return <div className="space-y-6">
    <form className="grid gap-3 rounded-md border p-4 sm:grid-cols-2" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setMessage("");
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      try {
        const result = await inviteUserAction({ email: String(form.get("email")), name: String(form.get("name")), role: form.get("role") === "admin" ? "admin" : "member" });
        setMessage(result.ok ? "Einladung vorgemerkt. Der Worker versendet die E-Mail." : result.error.message);
        if (result.ok) { formElement.reset(); router.refresh(); }
      } finally { setBusy(false); }
    }}>
      <Input name="name" placeholder="Name" aria-label="Name" required />
      <Input name="email" type="email" placeholder="E-Mail" aria-label="E-Mail" required />
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        <Select name="role" aria-label="Rolle" className="h-9 w-32" value={inviteRole} options={ROLE_OPTIONS} onValueChange={(next) => setInviteRole(next as UserRow["role"])} />
        <Button type="submit" disabled={busy}>Einladen</Button>
      </div>
    </form>
    {message && <p role="status" className="text-sm">{message}</p>}
    <ul className="divide-y rounded-md border" aria-label="Nutzer">
      {users.map((user) => <li key={user.id} className="space-y-3 p-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium [overflow-wrap:anywhere]">{user.name}</p>
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{user.email}</p>
          <p className="text-xs text-muted-foreground">{user.id === ownId ? (user.role === "admin" ? "Admin · " : "Mitglied · ") : ""}{user.active ? "Aktiv" : "Inaktiv"}</p>
        </div>
        {(user.id !== ownId || !user.active) && <div className="flex flex-wrap items-center gap-2">
        {user.id !== ownId && <Select aria-label={`Rolle von ${user.name}`} value={user.role} disabled={busy} className="w-28" options={ROLE_OPTIONS}
          onValueChange={async (next) => {
            const role = next === "admin" ? "admin" : "member";
            setBusy(true); try { const result = await setUserRoleAction(user.id, role);
              if (!result.ok) setMessage(result.error.message); else router.refresh();
            } finally { setBusy(false); }
          }} />}
        {user.id !== ownId && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); try { const result = await setUserActiveAction(user.id, !user.active);
            if (!result.ok) setMessage(result.error.message); else router.refresh();
          } finally { setBusy(false); }
        }}>{user.active ? "Deaktivieren" : "Aktivieren"}</Button>}
        {!user.active && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={async () => {
          setBusy(true); try { const result = await revokeInvitationAction(user.id);
            setMessage(result.ok ? `Einladung für ${user.email} zurückgezogen.` : result.error.message);
          } finally { setBusy(false); }
        }}>Einladung zurückziehen</Button>}
        </div>}
      </li>)}
    </ul>
  </div>;
}
