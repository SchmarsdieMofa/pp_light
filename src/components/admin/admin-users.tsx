"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inviteUserAction, revokeInvitationAction, setUserActiveAction, setUserRoleAction } from "@/app/(app)/settings/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { UserListRow } from "@/server/users/invitations";

export type UserRow = UserListRow;

const ROLE_OPTIONS = [{ value: "member", label: "Mitglied" }, { value: "admin", label: "Admin" }];

/** Person | Status | Gruppen · Projekte | Aktionen – the same grid for the header and every row. */
const GRID = "lg:grid lg:grid-cols-[minmax(0,1.5fr)_8rem_minmax(0,1fr)_25rem] lg:items-center lg:gap-x-4";

type Filter = "all" | "active" | "pending" | "inactive";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Aktiv" },
  { value: "pending", label: "Eingeladen" },
  { value: "inactive", label: "Deaktiviert" },
];

function statusOf(user: UserRow): Exclude<Filter, "all"> {
  return user.active ? "active" : user.invited ? "pending" : "inactive";
}

const STATUS_STYLE = {
  active: { label: "Aktiv", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  pending: { label: "Eingeladen", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  inactive: { label: "Deaktiviert", className: "bg-muted text-muted-foreground" },
} as const;

export function AdminUsers({ users, ownId }: { users: UserRow[]; ownId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRow["role"]>("member");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const needle = query.trim().toLocaleLowerCase("de");
  const shown = users.filter(
    (user) =>
      (filter === "all" || statusOf(user) === filter) &&
      (!needle || `${user.name} ${user.email} ${user.groups.join(" ")}`.toLocaleLowerCase("de").includes(needle)),
  );
  const counts = (value: Filter) => (value === "all" ? users.length : users.filter((user) => statusOf(user) === value).length);

  async function act(task: () => Promise<{ ok: boolean; error?: { message: string } } & Record<string, unknown>>, success?: string) {
    setBusy(true);
    try {
      const result = await task();
      if (!result.ok) setMessage(result.error?.message ?? "Das hat nicht geklappt.");
      else {
        if (success) setMessage(success);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          const formElement = event.currentTarget;
          const form = new FormData(formElement);
          try {
            const result = await inviteUserAction({ email: String(form.get("email")), name: String(form.get("name")), role: form.get("role") === "admin" ? "admin" : "member" });
            setMessage(result.ok ? "Einladung vorgemerkt. Der Worker versendet die E-Mail." : result.error.message);
            if (result.ok) {
              formElement.reset();
              router.refresh();
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input name="name" placeholder="Name" aria-label="Name" required />
        <Input name="email" type="email" placeholder="E-Mail" aria-label="E-Mail" required />
        <Select name="role" aria-label="Rolle" className="w-full sm:w-32" value={inviteRole} options={ROLE_OPTIONS} onValueChange={(next) => setInviteRole(next as UserRow["role"])} />
        <Button type="submit" disabled={busy}>Einladen</Button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Nutzer suchen" placeholder="Name, E-Mail oder Gruppe suchen…" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
        </div>
        <div role="group" aria-label="Status filtern" className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors",
                filter === item.value ? "border-primary/40 bg-primary/10 font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label} <span className="text-xs tabular-nums text-muted-foreground">{counts(item.value)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div aria-hidden className={cn(GRID, "hidden border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground")}>
          <span>Person</span>
          <span>Status</span>
          <span>Gruppen · Projekte</span>
          <span className="text-right">Aktionen</span>
        </div>
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Niemand gefunden.</p>}
        <ul className="divide-y" aria-label="Nutzer">
          {shown.map((user) => {
            const status = STATUS_STYLE[statusOf(user)];
            const own = user.id === ownId;
            return (
              <li key={user.id} className={cn(GRID, "flex flex-col gap-2 px-3 py-2.5 hover:bg-muted/30")}>
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{initials(user.name)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">
                      {user.name}
                      {own && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(du)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs", status.className)}>{status.label}</span>
                  {user.role === "admin" && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Admin</span>}
                </div>
                <div className="min-w-0 space-y-0.5 text-xs text-muted-foreground">
                  <p className="[overflow-wrap:anywhere]">{user.groups.length > 0 ? user.groups.join(", ") : "Keine Gruppe"}</p>
                  <p>{user.projectCount} {user.projectCount === 1 ? "Projekt" : "Projekte"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {!own && (
                    <Select
                      aria-label={`Rolle von ${user.name}`}
                      value={user.role}
                      disabled={busy}
                      className="w-28"
                      options={ROLE_OPTIONS}
                      onValueChange={(next) => act(() => setUserRoleAction(user.id, next === "admin" ? "admin" : "member"))}
                    />
                  )}
                  {!own && (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act(() => setUserActiveAction(user.id, !user.active))}>
                      {user.active ? "Deaktivieren" : "Aktivieren"}
                    </Button>
                  )}
                  {!user.active && (
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act(() => revokeInvitationAction(user.id), `Einladung für ${user.email} zurückgezogen.`)}>
                      Einladung zurückziehen
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
