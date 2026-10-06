"use client";

import { Plus, Trash2, UserMinus } from "lucide-react";
import { useState } from "react";
import {
  addGroupMemberAction,
  createGroupAction,
  deleteGroupAction,
  removeGroupMemberAction,
  renameGroupAction,
} from "@/app/(app)/settings/groups/actions";
import { AutosaveInput, ConfirmAction, useRunner } from "@/components/projects/settings-ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { GroupRow } from "@/server/groups/service";
import type { UserRow } from "./admin-users";

const inputClass =
  "h-8 min-w-0 flex-1 basis-48 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function AdminGroups({ groups, users }: { groups: GroupRow[]; users: UserRow[] }) {
  const [name, setName] = useState("");
  const { pending, run } = useRunner();
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          run(() => createGroupAction(name), () => setName(""));
        }}
      >
        <input aria-label="Name der neuen Gruppe" placeholder="Neue Gruppe, z. B. „Marketing“" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}>
          <Plus /> Gruppe anlegen
        </Button>
      </form>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Gruppen.</p>
      ) : (
        <ul aria-label="Gruppen" className="space-y-3">
          {groups.map((group) => (
            <GroupCard key={group.id} group={group} users={users} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupCard({ group, users }: { group: GroupRow; users: UserRow[] }) {
  const { pending, run } = useRunner();
  const inGroup = new Set(group.members.map((member) => member.id));
  const options = users
    .filter((user) => user.active && !inGroup.has(user.id))
    .map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }));
  return (
    <li>
      <section aria-label={`Gruppe ${group.name}`} className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center gap-1">
          <AutosaveInput value={group.name} label="Gruppenname" required maxLength={80} onSave={(next) => renameGroupAction(group.id, next)} className="flex-1 font-medium" />
          <span className="shrink-0 text-xs text-muted-foreground">{group.members.length} {group.members.length === 1 ? "Person" : "Personen"}</span>
          <ConfirmAction
            trigger={<Trash2 />}
            triggerLabel={`Gruppe ${group.name} löschen`}
            title={`Gruppe „${group.name}“ löschen?`}
            description="Nur die Gruppe verschwindet. Wer schon über sie zu einem Projekt hinzugefügt wurde, bleibt dort Mitglied."
            confirmLabel="Löschen"
            pending={pending}
            onConfirm={() => run(() => deleteGroupAction(group.id))}
          />
        </div>
        {group.members.length > 0 && (
          <ul aria-label={`Mitglieder von ${group.name}`} className="divide-y rounded-md border">
            {group.members.map((member) => (
              <li key={member.id} className="flex items-center gap-2 px-2 py-1 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block [overflow-wrap:anywhere]">{member.name}{!member.active && <span className="text-xs text-muted-foreground"> (inaktiv)</span>}</span>
                  <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{member.email}</span>
                </span>
                <Button type="button" size="icon-sm" variant="ghost" disabled={pending} aria-label={`${member.name} aus ${group.name} entfernen`} title="Aus der Gruppe entfernen" onClick={() => run(() => removeGroupMemberAction(group.id, member.id))}>
                  <UserMinus />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {options.length > 0 && (
          <Select
            aria-label={`Person zu ${group.name} hinzufügen`}
            placeholder="Person hinzufügen…"
            searchable
            searchPlaceholder="Name oder E-Mail suchen…"
            value=""
            disabled={pending}
            options={options}
            onValueChange={(userId) => run(() => addGroupMemberAction(group.id, userId))}
          />
        )}
      </section>
    </li>
  );
}
