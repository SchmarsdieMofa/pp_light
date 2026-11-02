"use client";

import { CalendarClock, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteAppointmentAction, saveAppointmentAction } from "@/app/(app)/appointments/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { appointmentInstant, appointmentLocalTime } from "@/lib/schemas/appointment";
import type { AppointmentRow } from "@/server/appointments/service";

export type PlannableTask = { id: string; title: string; projectId: string; key: string; path: string };

export function TimeBlockDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void; tasks: PlannableTask[];
  date: string; time?: string; initialTaskId?: string; appointment?: AppointmentRow;
}) {
  const id = useId();
  const router = useRouter();
  const initial = props.appointment;
  const initialStart = initial ? appointmentLocalTime(initial.startsAt) : `${props.date}T${props.time ?? "09:00"}`;
  const [taskId, setTaskId] = useState(initial?.taskId ?? props.initialTaskId ?? props.tasks[0]?.id ?? "");
  const [date, setDate] = useState<string | null>(initialStart.slice(0, 10));
  const [duration, setDuration] = useState(initial ? String(Math.round((Date.parse(initial.endsAt) - Date.parse(initial.startsAt)) / 60_000)) : "60");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const selected = props.tasks.find((t) => t.id === taskId);
  const options = props.tasks.map((task) => ({ value: task.id, label: `${task.key}-${task.path} ${task.title}` }));
  if (initial?.taskId && !options.some((o) => o.value === initial.taskId)) options.push({ value: initial.taskId, label: `${initial.key}-${initial.taskPath} ${initial.taskTitle ?? initial.title}` });
  const durations = [...new Set([15, 30, 45, 60, 90, 120, 180, Number(duration)])].filter((n) => n > 0).sort((a, b) => a - b);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CalendarClock className="size-4" />{initial ? "Zeitblock bearbeiten" : "Zeitblock planen"}</DialogTitle>
          <DialogDescription>Plane Arbeitszeit für deine Aufgabe. Die Fälligkeit bleibt unverändert.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          if (!date || !taskId || (!initial && !selected)) { setError("Bitte eine Aufgabe und einen Tag auswählen."); return; }
          const startsAt = `${date}T${String(data.get("time") ?? "")}`;
          const instant = appointmentInstant(startsAt);
          if (!Number.isFinite(instant.getTime())) { setError("Bitte eine gültige Uhrzeit eingeben."); return; }
          const endsAt = appointmentLocalTime(new Date(instant.getTime() + Number(duration) * 60_000));
          setError(null);
          startTransition(async () => {
            const result = await saveAppointmentAction({ projectId: initial?.projectId ?? selected!.projectId, taskId, personal: true,
              title: String(data.get("title") ?? ""), startsAt, endsAt, location: initial?.location ?? "" }, initial?.id);
            if (!result.ok) { setError(Object.values(result.error.fieldErrors ?? {}).flat()[0] ?? result.error.message); return; }
            props.onOpenChange(false);
            toast.success("Privater Zeitblock gespeichert", { action: { label: "Im Kalender öffnen", onClick: () => router.push(`/calendar?view=day&date=${date}&mine=1`) } });
          });
        }}>
          <fieldset disabled={pending} className="space-y-4">
            <div className="space-y-1"><label htmlFor={`${id}-task`}>Aufgabe</label>
              <Select id={`${id}-task`} value={taskId} onValueChange={setTaskId} disabled={pending || !!initial} options={options} placeholder="Aufgabe auswählen" /></div>
            <div className="space-y-1"><label htmlFor={`${id}-title`}>Titel</label>
              <Input key={taskId} id={`${id}-title`} name="title" required maxLength={200} defaultValue={initial?.title ?? selected?.title ?? ""} /></div>
            <div className="space-y-1"><label htmlFor={`${id}-date`}>Tag</label>
              <DatePicker id={`${id}-date`} label="Tag" value={date} onChange={setDate} disabled={pending} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label htmlFor={`${id}-time`}>Beginn</label><Input id={`${id}-time`} type="time" name="time" required defaultValue={initialStart.slice(11)} /></div>
              <div className="space-y-1"><label htmlFor={`${id}-duration`}>Dauer</label><Select id={`${id}-duration`} value={duration} onValueChange={setDuration} disabled={pending} options={durations.map((n) => ({ value: String(n), label: `${n} Minuten` }))} /></div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Nur für dich sichtbar · Uhrzeiten in Europe/Berlin</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              {initial && <Button type="button" variant={deleting ? "destructive" : "ghost"} disabled={pending} onClick={() => {
                if (!deleting) { setDeleting(true); return; }
                startTransition(async () => { const result = await deleteAppointmentAction(initial.id);
                  if (result.ok) { props.onOpenChange(false); toast.success("Zeitblock gelöscht"); } else setError(result.error.message); });
              }}>{deleting ? "Endgültig löschen" : "Löschen"}</Button>}
              <Button type="button" variant="ghost" onClick={() => props.onOpenChange(false)}>Abbrechen</Button>
              <Button type="submit" disabled={pending || !taskId}>{pending ? "Speichert…" : "Zeitblock speichern"}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
