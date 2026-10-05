"use client";

import { Select } from "@/components/ui/select";
import { UserPlus, UserMinus } from "lucide-react";
import { useState } from "react";
import { addMemberAction, changeMemberRoleAction, removeMemberAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import { ConfirmAction, useRunner } from "./settings-ui";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Owner", member: "Mitglied", guest: "Gast" };
const ROLE_HINTS: Record<ProjectRole, string> = {
  owner: "Verwaltet das Projekt",
  member: "Bearbeitet Aufgaben",
  guest: "Liest und kommentiert",
};
const roleOptions = PROJECT_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_HINTS[r] }));

type MemberItem = { id: string; name: string; email: string; role: ProjectRole };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function MemberManager(props: { projectId: string; members: MemberItem[]; canManage: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("member");
  const { pending, run } = useRunner();

  return (
    <div className="space-y-3">
      <ul aria-label="Mitglieder" className="divide-y rounded-lg border">
        {props.members.map((m) => (
          <li key={m.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {initials(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium [overflow-wrap:anywhere]">{m.name}</span>
              <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{m.email}</span>
            </span>
            {props.canManage ? (
              <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                <Select
                  aria-label={`Rolle von ${m.name}`}
                  className="w-28"
                  value={m.role}
                  disabled={pending}
                  options={roleOptions}
                  onValueChange={(next) => run(() => changeMemberRoleAction(props.projectId, m.id, next as ProjectRole))}
                />
                <ConfirmAction
                  trigger={<UserMinus />}
                  triggerLabel={`${m.name} entfernen`}
                  title={`${m.name} aus dem Projekt entfernen?`}
                  description="Die Person verliert den Zugriff auf das Projekt. Zuweisungen an sie werden aufgehoben."
                  confirmLabel="Entfernen"
                  pending={pending}
                  onConfirm={() => run(() => removeMemberAction(props.projectId, m.id))}
                />
              </div>
            ) : (
              <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto">{ROLE_LABELS[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {props.canManage && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addMemberAction(props.projectId, email, role), () => setEmail(""));
          }}
        >
          <input
            type="email"
            aria-label="E-Mail des Mitglieds"
            placeholder="E-Mail der Person"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8 min-w-0 flex-1 basis-56 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Select aria-label="Rolle" className="w-28" value={role} options={roleOptions} onValueChange={(next) => setRole(next as ProjectRole)} />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !email.trim()}>
            <UserPlus /> Mitglied hinzufügen
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Owner verwalten das Projekt · Mitglieder bearbeiten Aufgaben · Gäste lesen und kommentieren.
          </p>
        </form>
      )}
    </div>
  );
}
