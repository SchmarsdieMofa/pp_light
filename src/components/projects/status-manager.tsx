"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  createStatusAction,
  deleteStatusAction,
  moveStatusAction,
  updateStatusAction,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { LABEL_COLORS } from "@/lib/labels";
import { AutosaveInput, ColorPicker, ConfirmAction, useRunner } from "./settings-ui";

type StatusItem = { id: string; name: string; color: string; isDone: boolean };


/** Board columns: rename, recolor and mark as "done" in place – every change saves itself. */
export function StatusManager(props: { projectId: string; statuses: StatusItem[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const { pending, run } = useRunner();
  const nextColor = LABEL_COLORS[props.statuses.length % LABEL_COLORS.length].value;

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {props.statuses.map((s, i) => (
          <StatusRow
            key={s.id}
            status={s}
            others={props.statuses.filter((o) => o.id !== s.id)}
            first={i === 0}
            last={i === props.statuses.length - 1}
            canManage={props.canManage}
          />
        ))}
      </ul>
      {props.canManage && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => createStatusAction(props.projectId, { name, color: nextColor, isDone: false }), () => setName(""));
          }}
        >
          <input
            aria-label="Name der neuen Spalte"
            placeholder="Neue Spalte, z. B. „Blockiert“"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}>
            <Plus /> Spalte hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}

function StatusRow(props: { status: StatusItem; others: StatusItem[]; first: boolean; last: boolean; canManage: boolean }) {
  const s = props.status;
  const [target, setTarget] = useState(props.others[0]?.id ?? "");
  const { pending, run } = useRunner();
  const save = (patch: Partial<StatusItem>) => updateStatusAction(s.id, { name: s.name, color: s.color, isDone: s.isDone, ...patch });

  return (
    <li role="group" aria-label={`Spalte ${s.name}`} className="group flex items-center gap-1 px-2 py-1.5">
      <ColorPicker value={s.color} label={`Farbe von ${s.name}`} disabled={!props.canManage} onChange={(color) => run(() => save({ color }))} />
      <AutosaveInput value={s.name} label="Name" required maxLength={40} disabled={!props.canManage} onSave={(name) => save({ name })} className="flex-1" />
      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
        <Checkbox
          checked={s.isDone}
          disabled={!props.canManage || pending}
          onCheckedChange={(isDone) => run(() => save({ isDone }))}
        />
        Erledigt
      </label>
      {props.canManage && (
        <div className="flex shrink-0 items-center opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`${s.name} nach links`} title="Nach vorne" disabled={pending || props.first}
            onClick={() => run(() => moveStatusAction(s.id, "left"))}>
            <ChevronUp />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`${s.name} nach rechts`} title="Nach hinten" disabled={pending || props.last}
            onClick={() => run(() => moveStatusAction(s.id, "right"))}>
            <ChevronDown />
          </Button>
          {props.others.length > 0 && (
            <ConfirmAction
              trigger={<Trash2 />}
              triggerLabel={`Spalte ${s.name} löschen`}
              title={`Spalte „${s.name}“ löschen?`}
              description="Aufgaben in dieser Spalte ziehen in eine andere Spalte um. Sonst geht nichts verloren."
              confirmLabel="Spalte löschen"
              pending={pending}
              onConfirm={() => run(() => deleteStatusAction(s.id, target))}
            >
              <div className="space-y-1 text-sm">
                <label htmlFor={`move-target-${s.id}`} className="text-muted-foreground">Aufgaben verschieben nach</label>
                <Select
                  id={`move-target-${s.id}`}
                  value={target}
                  options={props.others.map((o) => ({ value: o.id, label: o.name }))}
                  onValueChange={setTarget}
                />
              </div>
            </ConfirmAction>
          )}
        </div>
      )}
    </li>
  );
}
