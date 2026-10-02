"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createPhaseAction, deletePhaseAction, movePhaseAction, updatePhaseAction } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import type { PhaseInput } from "@/lib/schemas/phase";
import type { ActionResult } from "@/server/action-result";
import type { Phase } from "@/server/phases/queries";

function useRun() {
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<ActionResult<void>>, onOk?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) onOk?.();
      else toast.error(result.error.fieldErrors ? Object.values(result.error.fieldErrors).flat()[0] : result.error.message);
    });
  }
  return { pending, run };
}

function phaseInput(name: string, start: string, end: string, milestone: boolean): PhaseInput {
  return { name, startDate: start || null, endDate: milestone ? (start || null) : (end || null), isMilestone: milestone };
}

export function PhaseManager(props: { projectId: string; phases: Phase[]; canManage: boolean }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [milestone, setMilestone] = useState(false);
  const { pending, run } = useRun();
  return (
    <div className="space-y-3">
      {props.phases.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Phasen.</p>}
      <ul className="space-y-2">
        {props.phases.map((phase, index) => (
          <PhaseRow key={phase.id} phase={phase} canManage={props.canManage}
            first={index === 0} last={index === props.phases.length - 1} />
        ))}
      </ul>
      {props.canManage && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          run(() => createPhaseAction(props.projectId, phaseInput(name, start, end, milestone)), () => {
            setName(""); setStart(""); setEnd(""); setMilestone(false);
          });
        }}>
          <label className="space-y-1 text-xs">Name
            <Input aria-label="Name der neuen Phase" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="h-8 w-40" />
          </label>
          <div className="space-y-1 text-xs"><span aria-hidden>Start</span>
            <DatePicker label="Start der neuen Phase" value={start || null} onChange={(iso) => setStart(iso ?? "")} className="w-36" />
          </div>
          {!milestone && <div className="space-y-1 text-xs"><span aria-hidden>Ende</span>
            <DatePicker label="Ende der neuen Phase" value={end || null} onChange={(iso) => setEnd(iso ?? "")} className="w-36" />
          </div>}
          <label className="flex h-8 items-center gap-1 text-xs">
            <input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /> Meilenstein
          </label>
          <Button type="submit" size="sm" disabled={pending}>Phase hinzufügen</Button>
        </form>
      )}
    </div>
  );
}

function PhaseRow(props: { phase: Phase; canManage: boolean; first: boolean; last: boolean }) {
  const phase = props.phase;
  const [name, setName] = useState(phase.name);
  const [start, setStart] = useState(phase.startDate ?? "");
  const [end, setEnd] = useState(phase.endDate ?? "");
  const [milestone, setMilestone] = useState(phase.isMilestone);
  const { pending, run } = useRun();
  if (!props.canManage) {
    return <li className="rounded-md border p-2 text-sm">{phase.name}{phase.isMilestone ? " · Meilenstein" : ""}</li>;
  }
  return (
    <li role="group" aria-label={`Phase ${phase.name}`} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <Input aria-label="Name" value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.target.value)} className="h-8 w-40" />
      <div className="flex items-center gap-1 text-xs"><span aria-hidden>Start</span>
        <DatePicker label="Start" value={start || null} disabled={pending} onChange={(iso) => setStart(iso ?? "")} className="w-36" />
      </div>
      {!milestone && <div className="flex items-center gap-1 text-xs"><span aria-hidden>Ende</span>
        <DatePicker label="Ende" value={end || null} disabled={pending} onChange={(iso) => setEnd(iso ?? "")} className="w-36" />
      </div>}
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={milestone} disabled={pending} onChange={(event) => setMilestone(event.target.checked)} /> Meilenstein
      </label>
      <Button type="button" size="sm" variant="secondary" disabled={pending}
        onClick={() => run(() => updatePhaseAction(phase.id, phaseInput(name, start, end, milestone)))}>Speichern</Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`${phase.name} nach links`} disabled={pending || props.first}
        onClick={() => run(() => movePhaseAction(phase.id, "left"))}><ArrowLeft className="size-4" /></Button>
      <Button type="button" size="icon" variant="ghost" aria-label={`${phase.name} nach rechts`} disabled={pending || props.last}
        onClick={() => run(() => movePhaseAction(phase.id, "right"))}><ArrowRight className="size-4" /></Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} className="ml-auto"
        onClick={() => run(() => deletePhaseAction(phase.id))}>Phase löschen</Button>
    </li>
  );
}
