"use client";

import { Select } from "@/components/ui/select";
import { Folder, UserPlus, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import {
  addGroupAction,
  addMemberAction,
  changeMemberRoleAction,
  changeProjectGroupRoleAction,
  removeMemberAction,
  removeProjectGroupAction,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { GROUP_PROJECT_ROLES, PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import type { ProjectGroup } from "@/server/groups/project-groups";
import type { Member } from "@/server/projects/service";
import { toast } from "sonner";
import { searchGroupsAction, searchUsersAction } from "@/app/(app)/projects/actions";
import { MemberPicker, type PickedGroup, type PickerScope } from "./member-picker";
import { ConfirmAction, useRunner } from "./settings-ui";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Owner", member: "Mitglied", guest: "Gast" };
const ROLE_HINTS: Record<ProjectRole, string> = {
  owner: "Verwaltet das Projekt",
  member: "Bearbeitet Aufgaben",
  guest: "Liest und kommentiert",
};
const option = (r: ProjectRole) => ({ value: r, label: ROLE_LABELS[r], description: ROLE_HINTS[r] });
const roleOptions = PROJECT_ROLES.map(option);
/** A whole group is never owner: whoever may edit the group must not be able to make owners that way. */
const groupRoleOptions = GROUP_PROJECT_ROLES.map(option);

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function MemberManager(props: { projectId: string; members: Member[]; groups: ProjectGroup[]; canManage: boolean }) {
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState<PickedGroup | null>(null);
  const [role, setRole] = useState<ProjectRole>("member");
  const { pending, run } = useRunner();
  const formRole: ProjectRole = group && role === "owner" ? "member" : role;
  const scope: PickerScope = {
    id: props.projectId,
    noun: "Projekt",
    searchUsers: (query, browse) => searchUsersAction(props.projectId, query, browse),
    searchGroups: (query, browse) => searchGroupsAction(props.projectId, query, browse),
  };

  return (
    <div className="space-y-4">
      {props.groups.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Gruppen im Projekt</h3>
          <ul aria-label="Gruppen im Projekt" className="divide-y rounded-lg border">
            {props.groups.map((g) => (
              <li key={g.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium [overflow-wrap:anywhere]">{g.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {g.size} {g.size === 1 ? "Person" : "Personen"} · wer in der Gruppe ist, ist im Projekt
                  </span>
                </span>
                {props.canManage ? (
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                    <Select
                      aria-label={`Rolle der Gruppe ${g.name}`}
                      className="w-28"
                      value={g.role}
                      disabled={pending}
                      options={groupRoleOptions}
                      onValueChange={(next) => run(() => changeProjectGroupRoleAction(props.projectId, g.id, next as ProjectRole))}
                    />
                    <ConfirmAction
                      trigger={<UserMinus />}
                      triggerLabel={`Gruppe ${g.name} entfernen`}
                      title={`Gruppe „${g.name}“ aus dem Projekt entfernen?`}
                      description="Wer nur über diese Gruppe im Projekt ist, verliert den Zugriff; Zuweisungen an diese Personen werden aufgehoben. Direkt hinzugefügte Mitglieder bleiben."
                      confirmLabel="Entfernen"
                      pending={pending}
                      onConfirm={() => run(() => removeProjectGroupAction(props.projectId, g.id))}
                    />
                  </div>
                ) : (
                  <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto">{ROLE_LABELS[g.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1.5">
        {props.groups.length > 0 && <h3 className="text-xs font-medium text-muted-foreground">Personen</h3>}
        <ul aria-label="Mitglieder" className="divide-y rounded-lg border">
          {props.members.map((m) => (
            <li key={m.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {initials(m.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium [overflow-wrap:anywhere]">{m.name}</span>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{m.email}</span>
                {m.groups.length > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <Users className="size-3 shrink-0" aria-hidden /> über Gruppe {m.groups.join(", ")}
                  </span>
                )}
                {m.viaFolder && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Folder className="size-3 shrink-0" aria-hidden /> über den Ordner
                  </span>
                )}
              </span>
              {props.canManage && m.directRole ? (
                <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                  <Select
                    aria-label={`Rolle von ${m.name}`}
                    className="w-28"
                    value={m.directRole}
                    disabled={pending}
                    options={roleOptions}
                    onValueChange={(next) => run(() => changeMemberRoleAction(props.projectId, m.id, next as ProjectRole))}
                  />
                  <ConfirmAction
                    trigger={<UserMinus />}
                    triggerLabel={`${m.name} entfernen`}
                    title={`${m.name} aus dem Projekt entfernen?`}
                    description={
                      m.groups.length > 0 || m.viaFolder
                        ? "Die Person bleibt über ihre Gruppe bzw. den Ordner im Projekt, aber nicht mehr mit dieser eigenen Rolle."
                        : "Die Person verliert den Zugriff auf das Projekt. Zuweisungen an sie werden aufgehoben."
                    }
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
      </div>
      {props.canManage && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (group) {
              run(() => addGroupAction(props.projectId, group.id, formRole), ({ size }) => {
                setGroup(null);
                toast.success(`Gruppe „${group.name}“ ist jetzt im Projekt (${size} ${size === 1 ? "Person" : "Personen"}).`);
              });
              return;
            }
            run(() => addMemberAction(props.projectId, email, role), () => setEmail(""));
          }}
        >
          <MemberPicker scope={scope} value={email} onChange={setEmail} group={group} onGroupChange={setGroup} />
          <Select
            aria-label="Rolle"
            className="w-28"
            value={formRole}
            options={group ? groupRoleOptions : roleOptions}
            onValueChange={(next) => setRole(next as ProjectRole)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || (!group && !email.trim())}>
            <UserPlus /> {group ? "Gruppe hinzufügen" : "Mitglied hinzufügen"}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            Owner verwalten das Projekt · Mitglieder bearbeiten Aufgaben · Gäste lesen und kommentieren. Eine Gruppe gilt dauerhaft: Wer später in die Gruppe kommt, ist auch im Projekt.
          </p>
        </form>
      )}
    </div>
  );
}
