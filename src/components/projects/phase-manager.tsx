"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Diamond, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { createPhaseAction, deletePhaseAction, movePhaseAction, updatePhaseAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { formatDate } from "@/lib/dates";
import type { PhaseInput } from "@/lib/schemas/phase";
import type { Phase } from "@/server/phases/queries";
import { AutosaveInput, ConfirmAction, useRunner } from "./settings-ui";

function phaseInput(name: string, start: string | null, end: string | null, milestone: boolean): PhaseInput {
  return { name, startDate: start, endDate: milestone ? start : end, isMilestone: milestone };
}

export function PhaseManager(props: { projectId: string; phases: Phase[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [milestone, setMilestone] = useState(false);
  const { pending, run } = useRunner();
  return (
    <div className="space-y-3">
      {props.phases.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Phasen. Phasen gliedern das Gantt-Diagramm, Meilensteine markieren Stichtage.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {props.phases.map((phase, index) => (
            <PhaseRow key={phase.id} phase={phase} canManage={props.canManage} first={index === 0} last={index === props.phases.length - 1} />
          ))}
        </ul>
      )}
      {props.canManage && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            run(() => createPhaseAction(props.projectId, phaseInput(name, start, end, milestone)), () => {
              setName(""); setStart(null); setEnd(null); setMilestone(false);
            });
          }}
        >
          <input
            aria-label="Name der neuen Phase"
            placeholder={milestone ? "Neuer Meilenstein, z. B. „Go-live“" : "Neue Phase, z. B. „Planung“"}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="h-8 min-w-0 flex-1 basis-48 rounded-md border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <DatePicker label="Start der neuen Phase" value={start} onChange={setStart} className="w-36" />
          {!milestone && <DatePicker label="Ende der neuen Phase" value={end} onChange={setEnd} className="w-36" />}
          <label className="flex h-8 items-center gap-1.5 px-1 text-xs text-muted-foreground">
            <Checkbox checked={milestone} onCheckedChange={setMilestone} /> Meilenstein
          </label>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !name.trim()}>
            <Plus /> Phase hinzufügen
          </Button>
        </form>
      )}
    </div>
  );
}

function PhaseRow(props: { phase: Phase; canManage: boolean; first: boolean; last: boolean }) {
  const phase = props.phase;
  const { pending, run } = useRunner();
  const save = (patch: Partial<{ name: string; start: string | null; end: string | null; milestone: boolean }>) => {
    const next = { name: phase.name, start: phase.startDate, end: phase.endDate, milestone: phase.isMilestone, ...patch };
    return updatePhaseAction(phase.id, phaseInput(next.name, next.start, next.end, next.milestone));
  };

  if (!props.canManage) {
    return (
      <li className="flex items-center gap-2 px-3 py-2 text-sm">
        {phase.isMilestone && <Diamond className="size-3.5 text-muted-foreground" aria-label="Meilenstein" />}
        <span className="flex-1">{phase.name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(phase.startDate)}{!phase.isMilestone && phase.endDate ? ` – ${formatDate(phase.endDate)}` : ""}
        </span>
      </li>
    );
  }
  return (
    <li role="group" aria-label={`Phase ${phase.name}`} className="group flex flex-wrap items-center gap-1 px-2 py-1.5">
      <span className="flex size-8 shrink-0 items-center justify-center text-muted-foreground" title={phase.isMilestone ? "Meilenstein" : "Phase"}>
        {phase.isMilestone ? <Diamond className="size-3.5" /> : <span className="h-1.5 w-4 rounded-full bg-current opacity-60" />}
      </span>
      <AutosaveInput value={phase.name} label="Name" required maxLength={80} onSave={(name) => save({ name })} className="min-w-32 flex-1" />
      <DatePicker label="Start" value={phase.startDate} disabled={pending} onChange={(start) => run(() => save({ start }))} className="w-36" />
      {!phase.isMilestone && (
        <DatePicker label="Ende" value={phase.endDate} disabled={pending} onChange={(end) => run(() => save({ end }))} className="w-36" />
      )}
      <label className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted">
        <Checkbox checked={phase.isMilestone} disabled={pending} onCheckedChange={(milestone) => run(() => save({ milestone }))} /> Meilenstein
      </label>
      <div className="ml-auto flex items-center opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`${phase.name} nach links`} title="Nach vorne" disabled={pending || props.first}
          onClick={() => run(() => movePhaseAction(phase.id, "left"))}><ChevronUp /></Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={`${phase.name} nach rechts`} title="Nach hinten" disabled={pending || props.last}
          onClick={() => run(() => movePhaseAction(phase.id, "right"))}><ChevronDown /></Button>
        <ConfirmAction
          trigger={<Trash2 />}
          triggerLabel="Phase löschen"
          title={`${phase.isMilestone ? "Meilenstein" : "Phase"} „${phase.name}“ löschen?`}
          description="Aufgaben dieser Phase bleiben erhalten, sind danach aber keiner Phase mehr zugeordnet."
          confirmLabel="Löschen"
          pending={pending}
          onConfirm={() => run(() => deletePhaseAction(phase.id))}
        />
      </div>
    </li>
  );
}
