"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addMemberAction, changeMemberRoleAction, removeMemberAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import type { ActionResult } from "@/server/action-result";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Owner", member: "Mitglied", guest: "Gast" };
const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

type MemberItem = { id: string; name: string; email: string; role: ProjectRole };

export function MemberManager(props: { projectId: string; members: MemberItem[]; canManage: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("member");
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult<void>>, onOk?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(res.error.message);
      else onOk?.();
    });
  }

  return (
    <div className="space-y-3">
      <ul aria-label="Mitglieder" className="space-y-1">
        {props.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {m.name} <span className="text-xs text-muted-foreground">{m.email}</span>
            </span>
            {props.canManage ? (
              <>
                <select
                  aria-label={`Rolle von ${m.name}`}
                  className={selectClass}
                  value={m.role}
                  disabled={pending}
                  onChange={(e) => run(() => changeMemberRoleAction(props.projectId, m.id, e.target.value as ProjectRole))}
                >
                  {PROJECT_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => removeMemberAction(props.projectId, m.id))}
                >
                  {m.name} entfernen
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
            )}
          </li>
        ))}
      </ul>
      {props.canManage && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addMemberAction(props.projectId, email, role), () => setEmail(""));
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="member-email">E-Mail des Mitglieds</Label>
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 w-64" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="member-role">Rolle</Label>
            <select id="member-role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
              {PROJECT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Mitglied hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}
