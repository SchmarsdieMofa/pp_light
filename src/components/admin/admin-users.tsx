"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteUserAction, setUserActiveAction } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type UserRow = { id: string; email: string; name: string; role: "admin" | "member"; active: boolean };

export function AdminUsers({ users, ownId }: { users: UserRow[]; ownId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  return <div className="space-y-6">
    <form className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={async (event) => {
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
      <select name="role" aria-label="Rolle" className="rounded-md border bg-background px-2 text-sm"><option value="member">Mitglied</option><option value="admin">Admin</option></select>
      <Button type="submit" disabled={busy}>Einladen</Button>
    </form>
    {message && <p role="status" className="text-sm">{message}</p>}
    <ul className="divide-y rounded-md border" aria-label="Nutzer">
      {users.map((user) => <li key={user.id} className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0"><p className="truncate font-medium">{user.name}</p><p className="truncate text-sm text-muted-foreground">{user.email} · {user.role === "admin" ? "Admin" : "Mitglied"} · {user.active ? "Aktiv" : "Inaktiv"}</p></div>
        {user.id !== ownId && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true); try { const result = await setUserActiveAction(user.id, !user.active);
            if (!result.ok) setMessage(result.error.message); else router.refresh();
          } finally { setBusy(false); }
        }}>{user.active ? "Deaktivieren" : "Aktivieren"}</Button>}
      </li>)}
    </ul>
  </div>;
}
