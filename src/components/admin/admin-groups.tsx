"use client";

import { Plus, Search, Trash2, UserMinus, Users } from "lucide-react";
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
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { GroupRow } from "@/server/groups/service";
import type { UserRow } from "./admin-users";

const inputClass =
  "h-8 min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Groups on the left, the selected group's people on the right. */
export function AdminGroups({ groups, users }: { groups: GroupRow[]; users: UserRow[] }) {
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { pending, run } = useRunner();
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0] ?? null;
  return (
    <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-3">
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            run(() => createGroupAction(name), ({ id }) => {
              setName("");
              setSelectedId(id);
            });
          }}
        >
          <input aria-label="Name der neuen Gruppe" placeholder="Neue Gruppe…" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={cn(inputClass, "flex-1")} />
          <Button type="submit" size="icon-sm" variant="outline" disabled={pending || !name.trim()} aria-label="Gruppe anlegen" title="Gruppe anlegen">
            <Plus />
          </Button>
        </form>
        {groups.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Noch keine Gruppen.</p>
        ) : (
          <ul aria-label="Gruppen" className="max-h-60 divide-y overflow-y-auto rounded-lg border md:max-h-none">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  type="button"
                  aria-current={selected?.id === group.id ? "true" : undefined}
                  onClick={() => setSelectedId(group.id)}
                  className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50", selected?.id === group.id && "bg-muted font-medium")}
                >
                  <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{group.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.members.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected ? <GroupDetail key={selected.id} group={selected} users={users} /> : (
        <p className="hidden self-center text-center text-sm text-muted-foreground md:block">Lege links eine Gruppe an, um Personen hinzuzufügen.</p>
      )}
    </div>
  );
}

function GroupDetail({ group, users }: { group: GroupRow; users: UserRow[] }) {
  const { pending, run } = useRunner();
  const [query, setQuery] = useState("");
  const inGroup = new Set(group.members.map((member) => member.id));
  const options = users
    .filter((user) => user.active && !inGroup.has(user.id))
    .map((user) => ({ value: user.id, label: `${user.name} · ${user.email}` }));
  const needle = query.trim().toLocaleLowerCase("de");
  const members = needle ? group.members.filter((member) => `${member.name} ${member.email}`.toLocaleLowerCase("de").includes(needle)) : group.members;
  return (
    <section aria-label={`Gruppe ${group.name}`} className="min-w-0 space-y-3">
      <div className="flex items-center gap-1">
        <AutosaveInput value={group.name} label="Gruppenname" required maxLength={80} onSave={(next) => renameGroupAction(group.id, next)} className="flex-1 text-base font-semibold" />
        <ConfirmAction
          trigger={<Trash2 />}
          triggerLabel={`Gruppe ${group.name} löschen`}
          title={`Gruppe „${group.name}“ löschen?`}
          description={
            group.projects.length > 0
              ? `Die Gruppe ist Teil von ${group.projects.length} ${group.projects.length === 1 ? "Projekt" : "Projekten"} (${group.projects.map((p) => p.name).join(", ")}). Wer dort nur über diese Gruppe Zugang hat, verliert ihn.`
              : "Die Gruppe ist in keinem Projekt; es ändert sich für niemanden etwas."
          }
          confirmLabel="Löschen"
          pending={pending}
          onConfirm={() => run(() => deleteGroupAction(group.id))}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {options.length > 0 && (
          <Select
            aria-label={`Person zu ${group.name} hinzufügen`}
            placeholder="Person hinzufügen…"
            searchable
            searchRequired
            searchPlaceholder="Name oder E-Mail suchen…"
            value=""
            disabled={pending}
            className="w-full sm:w-72"
            options={options}
            onValueChange={(userId) => run(() => addGroupMemberAction(group.id, userId))}
          />
        )}
        {group.members.length > 6 && (
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" aria-label={`Personen in ${group.name} suchen`} placeholder="Suchen…" value={query} onChange={(event) => setQuery(event.target.value)} className={cn(inputClass, "w-full pl-8")} />
          </div>
        )}
        <p className="ml-auto text-sm text-muted-foreground">{group.members.length} {group.members.length === 1 ? "Person" : "Personen"}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        {group.projects.length > 0
          ? `In den Projekten: ${group.projects.map((p) => p.name).join(", ")} – wer hinzukommt oder geht, bekommt dort sofort Zugang bzw. verliert ihn.`
          : "Noch in keinem Projekt. Projekt-Owner fügen die Gruppe in den Projekteinstellungen hinzu."}
      </p>
      {group.members.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Diese Gruppe ist noch leer.</p>
      ) : (
        <ul aria-label={`Mitglieder von ${group.name}`} className="divide-y overflow-hidden rounded-lg border">
          {members.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Niemand gefunden.</li>}
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{initials(member.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium [overflow-wrap:anywhere]">
                  {member.name}
                  {!member.active && <span className="ml-1.5 text-xs font-normal text-muted-foreground">inaktiv</span>}
                </span>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{member.email}</span>
              </span>
              <Button type="button" size="icon-sm" variant="ghost" disabled={pending} aria-label={`${member.name} aus ${group.name} entfernen`} title="Aus der Gruppe entfernen" onClick={() => run(() => removeGroupMemberAction(group.id, member.id))}>
                <UserMinus />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
