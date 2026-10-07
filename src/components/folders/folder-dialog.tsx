"use client";

import { UserMinus, UserPlus, Users, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  addFolderGroupAction,
  addFolderMemberAction,
  changeFolderGroupRoleAction,
  changeFolderMemberRoleAction,
  deleteFolderAction,
  getFolderDetailAction,
  removeFolderGroupAction,
  removeFolderMemberAction,
  renameFolderAction,
  searchFolderGroupsAction,
  searchFolderUsersAction,
} from "@/app/(app)/folders/actions";
import { MemberPicker, type PickedGroup, type PickerScope } from "@/components/projects/member-picker";
import { AutosaveInput, ConfirmAction, useRunner } from "@/components/projects/settings-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { GROUP_PROJECT_ROLES, PROJECT_ROLES, type ProjectRole } from "@/lib/enums";
import { initials } from "@/lib/initials";
import type { ActionResult } from "@/server/action-result";
import type { FolderDetail } from "@/server/folders/service";

const ROLE_LABELS: Record<ProjectRole, string> = { owner: "Owner", member: "Mitglied", guest: "Gast" };
const ROLE_HINTS: Record<ProjectRole, string> = {
  owner: "Verwaltet den Ordner, Owner in allen Projekten darin",
  member: "Bearbeitet Aufgaben in allen Projekten darin",
  guest: "Liest und kommentiert in allen Projekten darin",
};
const option = (role: ProjectRole) => ({ value: role, label: ROLE_LABELS[role], description: ROLE_HINTS[role] });
const roleOptions = PROJECT_ROLES.map(option);
/** Like in projects, a whole group is never owner. */
const groupRoleOptions = GROUP_PROJECT_ROLES.map(option);

/** One folder: its name, the projects in it and the people whose access reaches all of them. Opens as a dialog. */
export function FolderDialog(props: { folderId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [detail, setDetail] = useState<FolderDetail | null>(null);
  const router = useRouter();
  const { folderId, open } = props;

  useEffect(() => {
    if (!open) return;
    let stale = false;
    (async () => {
      const res = await getFolderDetailAction(folderId);
      if (stale) return;
      if (res.ok) setDetail(res.data);
      else toast.error(res.error.message);
    })();
    return () => {
      stale = true;
      setDetail(null);
    };
  }, [open, folderId]);

  async function reload() {
    const res = await getFolderDetailAction(folderId);
    if (res.ok) setDetail(res.data);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        {detail ? <FolderBody detail={detail} reload={reload} onDeleted={() => { props.onOpenChange(false); router.refresh(); }} /> : (
          <>
            <DialogHeader>
              <DialogTitle>Ordner</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Lädt…</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FolderBody({ detail, reload, onDeleted }: { detail: FolderDetail; reload: () => Promise<void>; onDeleted: () => void }) {
  const { pending, run } = useRunner();
  const canManage = detail.role === "owner";
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState<PickedGroup | null>(null);
  const [role, setRole] = useState<ProjectRole>("member");
  const formRole: ProjectRole = group && role === "owner" ? "member" : role;
  const scope: PickerScope = {
    id: detail.id,
    noun: "Ordner",
    searchUsers: (query, browse) => searchFolderUsersAction(detail.id, query, browse),
    searchGroups: (query, browse) => searchFolderGroupsAction(detail.id, query, browse),
  };
  /** Runs a change, then shows the new state. */
  const act = <T,>(action: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) =>
    run(action, (data) => {
      onOk?.(data);
      void reload();
    });

  return (
    <div className="space-y-5">
      <DialogHeader>
        {canManage ? (
          <DialogTitle className="sr-only">Ordner {detail.name}</DialogTitle>
        ) : (
          <DialogTitle>Ordner {detail.name}</DialogTitle>
        )}
        {canManage && (
          <AutosaveInput
            value={detail.name}
            label="Ordnername"
            required
            maxLength={80}
            className="text-base font-semibold"
            onSave={async (next) => {
              const res = await renameFolderAction(detail.id, next);
              if (res.ok) void reload();
              return res;
            }}
          />
        )}
        <DialogDescription>
          Wer im Ordner ist, hat in allen Projekten darin dieselbe Rolle, auch in künftigen. Ein Projekt kann zusätzlich eigene Mitglieder haben; der Ordner nimmt nie Rechte weg.
        </DialogDescription>
      </DialogHeader>

      <section aria-label="Projekte im Ordner" className="space-y-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">Projekte ({detail.projects.length})</h3>
        {detail.projects.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
            Noch keine Projekte. Lege ein Projekt im Ordner an oder verschiebe eins in den Projekteinstellungen hierher.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {detail.projects.map((project) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}/board`} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                  <span className="min-w-8 text-xs text-muted-foreground">{project.key}</span>
                  <span className="truncate">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.groups.length > 0 && (
        <section aria-label="Gruppen im Ordner" className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground">Gruppen</h3>
          <ul aria-label="Gruppen im Ordner" className="divide-y rounded-lg border">
            {detail.groups.map((g) => (
              <li key={g.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Users className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium [overflow-wrap:anywhere]">{g.name}</span>
                  <span className="block text-xs text-muted-foreground">{g.size} {g.size === 1 ? "Person" : "Personen"} · wer in der Gruppe ist, ist im Ordner</span>
                </span>
                {canManage ? (
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                    <Select
                      aria-label={`Rolle der Gruppe ${g.name}`}
                      className="w-28"
                      value={g.role}
                      disabled={pending}
                      options={groupRoleOptions}
                      onValueChange={(next) => act(() => changeFolderGroupRoleAction(detail.id, g.id, next as ProjectRole))}
                    />
                    <ConfirmAction
                      trigger={<UserMinus />}
                      triggerLabel={`Gruppe ${g.name} entfernen`}
                      title={`Gruppe „${g.name}“ aus dem Ordner entfernen?`}
                      description="Wer nur über diese Gruppe im Ordner ist, verliert den Zugriff auf alle Projekte darin; Zuweisungen an diese Personen werden aufgehoben. Direkte Projektmitglieder bleiben."
                      confirmLabel="Entfernen"
                      pending={pending}
                      onConfirm={() => act(() => removeFolderGroupAction(detail.id, g.id))}
                    />
                  </div>
                ) : (
                  <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto">{ROLE_LABELS[g.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Personen im Ordner" className="space-y-1.5">
        {detail.groups.length > 0 && <h3 className="text-xs font-medium text-muted-foreground">Personen</h3>}
        <ul aria-label="Mitglieder des Ordners" className="divide-y rounded-lg border">
          {detail.members.map((m) => (
            <li key={m.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3 px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{initials(m.name)}</span>
              <span className="min-w-0">
                <span className="block font-medium [overflow-wrap:anywhere]">{m.name}</span>
                <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{m.email}</span>
                {m.groups.length > 0 && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    <Users className="size-3 shrink-0" aria-hidden /> über Gruppe {m.groups.join(", ")}
                  </span>
                )}
              </span>
              {canManage && m.directRole ? (
                <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto">
                  <Select
                    aria-label={`Rolle von ${m.name} im Ordner`}
                    className="w-28"
                    value={m.directRole}
                    disabled={pending}
                    options={roleOptions}
                    onValueChange={(next) => act(() => changeFolderMemberRoleAction(detail.id, m.id, next as ProjectRole))}
                  />
                  <ConfirmAction
                    trigger={<UserMinus />}
                    triggerLabel={`${m.name} aus dem Ordner entfernen`}
                    title={`${m.name} aus dem Ordner entfernen?`}
                    description={
                      m.groups.length > 0
                        ? "Die Person bleibt über ihre Gruppe im Ordner, aber nicht mehr mit dieser eigenen Rolle."
                        : "Die Person verliert den Zugriff auf alle Projekte im Ordner, in denen sie nicht selbst Mitglied ist. Zuweisungen an sie dort werden aufgehoben."
                    }
                    confirmLabel="Entfernen"
                    pending={pending}
                    onConfirm={() => act(() => removeFolderMemberAction(detail.id, m.id))}
                  />
                </div>
              ) : (
                <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto">{ROLE_LABELS[m.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && (
        <form
          aria-label="Zum Ordner hinzufügen"
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (group) {
              act(() => addFolderGroupAction(detail.id, group.id, formRole), ({ size }) => {
                setGroup(null);
                toast.success(`Gruppe „${group.name}“ ist jetzt im Ordner (${size} ${size === 1 ? "Person" : "Personen"}).`);
              });
              return;
            }
            act(() => addFolderMemberAction(detail.id, email, role), () => setEmail(""));
          }}
        >
          <MemberPicker scope={scope} value={email} onChange={setEmail} group={group} onGroupChange={setGroup} />
          <Select
            aria-label="Rolle im Ordner"
            className="w-28"
            value={formRole}
            options={group ? groupRoleOptions : roleOptions}
            onValueChange={(next) => setRole(next as ProjectRole)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || (!group && !email.trim())}>
            <UserPlus /> {group ? "Gruppe hinzufügen" : "Hinzufügen"}
          </Button>
        </form>
      )}

      {canManage && (
        <div className="flex justify-end border-t pt-3">
          <ConfirmAction
            trigger={<><Trash2 /> Ordner löschen</>}
            triggerSize="sm"
            triggerVariant="outline"
            title={`Ordner „${detail.name}“ löschen?`}
            description={
              detail.projects.length > 0
                ? `Die ${detail.projects.length === 1 ? "1 Projekt bleibt" : `${detail.projects.length} Projekte bleiben`} erhalten, liegt danach aber in keinem Ordner. Wer nur über den Ordner Zugriff hatte, verliert ihn.`
                : "Der Ordner ist leer; es ändert sich für niemanden etwas."
            }
            confirmLabel="Löschen"
            pending={pending}
            onConfirm={() => run(() => deleteFolderAction(detail.id), onDeleted)}
          />
        </div>
      )}
    </div>
  );
}
