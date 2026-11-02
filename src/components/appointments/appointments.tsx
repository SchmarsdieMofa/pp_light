"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { deleteAppointmentAction, saveAppointmentAction } from "@/app/(app)/appointments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, todayInZone } from "@/lib/dates";
import { appointmentLocalTime } from "@/lib/schemas/appointment";
import type { AppointmentRow } from "@/server/appointments/service";

type TaskOption = { id: string; path: string; title: string };
type Props = {
  projectId: string; appointments: AppointmentRow[]; canEdit: boolean;
  tasks?: TaskOption[]; taskId?: string;
};

export function Appointments(props: Props) {
  const [editing, setEditing] = useState<AppointmentRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section aria-label="Termine" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="size-4" />Termine</h2>
        {props.canEdit && !editing && <Button size="sm" variant="outline" onClick={() => setEditing("new")}>Termin anlegen</Button>}
      </div>
      {editing && <AppointmentForm key={typeof editing === "string" ? editing : editing.id}
        projectId={props.projectId} tasks={props.tasks ?? []} taskId={props.taskId}
        appointment={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {props.appointments.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Termine angelegt.</p>}
      <ul className="space-y-2">
        {props.appointments.map((entry) => {
          const start = appointmentLocalTime(entry.startsAt);
          const end = appointmentLocalTime(entry.endsAt);
          return (
            <li key={entry.id} id={entry.id} className="scroll-mt-6 space-y-2 rounded-lg border p-3 text-sm target:ring-2 target:ring-ring">
              <p className="font-medium">{entry.title}</p>
              {entry.isPersonal && <p className="text-xs text-muted-foreground">Privater Zeitblock · nur für dich</p>}
              <p className="text-muted-foreground">
                <time dateTime={entry.startsAt}>{formatDate(start.slice(0, 10))}, {start.slice(11)}</time>
                {" – "}<time dateTime={entry.endsAt}>{start.slice(0, 10) !== end.slice(0, 10) ? `${formatDate(end.slice(0, 10))}, ` : ""}{end.slice(11)}</time>
                {" Uhr"}
              </p>
              {entry.location && <p className="break-words text-muted-foreground">{entry.location}</p>}
              {entry.taskId && !props.taskId && <Link className="text-primary hover:underline" href={`/tasks/${entry.taskId}`}>{entry.key}-{entry.taskPath} {entry.taskTitle}</Link>}
              {entry.canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(entry)}>Bearbeiten</Button>
                  {deleting === entry.id ? <>
                    <Button size="sm" variant="destructive" disabled={pending} onClick={() => startTransition(async () => {
                      const result = await deleteAppointmentAction(entry.id);
                      if (!result.ok) toast.error(result.error.message);
                      else { setDeleting(null); if (editing !== "new" && editing?.id === entry.id) setEditing(null); }
                    })}>Endgültig löschen</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>Abbrechen</Button>
                  </> : <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeleting(entry.id)}>Löschen</Button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AppointmentForm(props: { projectId: string; taskId?: string; tasks: TaskOption[]; appointment?: AppointmentRow; onClose: () => void }) {
  const id = useId();
  const [taskId, setTaskId] = useState(props.taskId ?? props.appointment?.taskId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = props.appointment;
  return (
    <form className="space-y-3 rounded-lg border bg-muted/20 p-3" aria-label={initial ? "Termin bearbeiten" : "Neuer Termin"}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await saveAppointmentAction({ projectId: props.projectId, taskId: taskId || null, personal: initial?.isPersonal ?? false,
            title: String(data.get("title") ?? ""), startsAt: String(data.get("startsAt") ?? ""),
            endsAt: String(data.get("endsAt") ?? ""), location: String(data.get("location") ?? "") }, initial?.id);
          if (result.ok) { toast.success(initial ? "Termin gespeichert" : "Termin angelegt"); props.onClose(); }
          else setError(result.error.fieldErrors ? Object.values(result.error.fieldErrors).flat()[0] ?? result.error.message : result.error.message);
        });
      }}>
      <fieldset disabled={pending} className="space-y-3">
        <div className="space-y-1"><label htmlFor={`${id}-title`} className="text-sm">Titel</label>
          <Input id={`${id}-title`} name="title" required maxLength={200} defaultValue={initial?.title} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><label htmlFor={`${id}-start`} className="text-sm">Beginn</label>
            <Input id={`${id}-start`} name="startsAt" type="datetime-local" required defaultValue={initial ? appointmentLocalTime(initial.startsAt) : `${todayInZone()}T09:00`} /></div>
          <div className="space-y-1"><label htmlFor={`${id}-end`} className="text-sm">Ende</label>
            <Input id={`${id}-end`} name="endsAt" type="datetime-local" required defaultValue={initial ? appointmentLocalTime(initial.endsAt) : `${todayInZone()}T10:00`} /></div>
        </div>
        <p className="text-xs text-muted-foreground">Alle Uhrzeiten in Europe/Berlin.</p>
        <div className="space-y-1"><label htmlFor={`${id}-location`} className="text-sm">Ort (optional)</label>
          <Input id={`${id}-location`} name="location" maxLength={500} defaultValue={initial?.location} /></div>
        {!props.taskId && <div className="space-y-1"><label htmlFor={`${id}-task`} className="text-sm">Aufgabe (optional)</label>
          <Select id={`${id}-task`} value={taskId} onValueChange={setTaskId} options={[{ value: "", label: "Nur Projekt" }, ...props.tasks.map((task) => ({ value: task.id, label: `${task.path} ${task.title}` }))]} /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{pending ? "Speichert…" : "Speichern"}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>Abbrechen</Button></div>
      </fieldset>
    </form>
  );
}
