"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createStatusAction,
  deleteStatusAction,
  moveStatusAction,
  updateStatusAction,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LABEL_COLORS } from "@/lib/labels";
import type { ActionResult } from "@/server/action-result";

type StatusItem = { id: string; name: string; color: string; isDone: boolean };

const selectClass = "h-8 rounded-md border bg-background px-2 text-sm";

function useRunner() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult<void>>, onOk?: () => void) =>
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        const fieldMessage = res.error.fieldErrors ? Object.values(res.error.fieldErrors).flat()[0] : undefined;
        toast.error(fieldMessage ?? res.error.message);
      } else onOk?.();
    });
  return { pending, run };
}

function ColorSelect(props: { id: string; label?: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  // Unknown legacy colors (e.g. the M1 defaults) stay selectable so saving does not silently change them.
  const known = LABEL_COLORS.some((c) => c.value === props.value);
  return (
    <select
      id={props.id}
      aria-label={props.label}
      className={selectClass}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {!known && <option value={props.value}>Aktuelle Farbe</option>}
      {LABEL_COLORS.map((c) => (
        <option key={c.value} value={c.value}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function StatusManager(props: { projectId: string; statuses: StatusItem[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(LABEL_COLORS[5].value);
  const { pending, run } = useRunner();

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
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
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createStatusAction(props.projectId, { name, color, isDone: false }), () => setName(""));
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-status-name">Name der neuen Spalte</Label>
            <Input id="new-status-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-8 w-48" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-status-color">Farbe der neuen Spalte</Label>
            <ColorSelect id="new-status-color" value={color} onChange={setColor} />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Spalte hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}

function StatusRow(props: { status: StatusItem; others: StatusItem[]; first: boolean; last: boolean; canManage: boolean }) {
  const s = props.status;
  const [name, setName] = useState(s.name);
  const [color, setColor] = useState(s.color);
  const [isDone, setIsDone] = useState(s.isDone);
  const [target, setTarget] = useState(props.others[0]?.id ?? "");
  const { pending, run } = useRunner();
  const disabled = !props.canManage || pending;

  return (
    <li role="group" aria-label={`Spalte ${s.name}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      <Input aria-label="Name" value={name} maxLength={40} disabled={disabled} onChange={(e) => setName(e.target.value)} className="h-8 w-40" />
      <ColorSelect id={`color-${s.id}`} label="Farbe" value={color} onChange={setColor} disabled={disabled} />
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={isDone} disabled={disabled} onChange={(e) => setIsDone(e.target.checked)} />
        Gilt als erledigt
      </label>
      {props.canManage && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => updateStatusAction(s.id, { name, color, isDone }))}
          >
            Speichern
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`${s.name} nach links`}
            disabled={pending || props.first}
            onClick={() => run(() => moveStatusAction(s.id, "left"))}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`${s.name} nach rechts`}
            disabled={pending || props.last}
            onClick={() => run(() => moveStatusAction(s.id, "right"))}
          >
            <ArrowRight className="size-4" />
          </Button>
          {props.others.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs">
              <label htmlFor={`target-${s.id}`}>Aufgaben verschieben nach</label>
              <select id={`target-${s.id}`} className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}>
                {props.others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteStatusAction(s.id, target))}>
                Spalte löschen
              </Button>
            </span>
          )}
        </>
      )}
    </li>
  );
}
