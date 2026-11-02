"use client";

import { CalendarClock, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TimeBlockDialog, type PlannableTask } from "@/components/appointments/time-block-dialog";
import { Button } from "@/components/ui/button";
import { longDate } from "@/lib/calendar";
import { calendarDayBounds, layoutDayAppointments } from "@/lib/day-calendar";
import { appointmentInstant, appointmentLocalTime } from "@/lib/schemas/appointment";
import type { AppointmentRow } from "@/server/appointments/service";

const PX_PER_MINUTE = 88 / 60;

export function DayView(props: {
  date: string; appointments: AppointmentRow[]; tasks: PlannableTask[];
  colorOf: (projectId: string) => string; untimed: React.ReactNode; initialNow: number;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [planning, setPlanning] = useState<{ time: string; appointment?: AppointmentRow } | null>(null);
  const [now, setNow] = useState(props.initialNow);
  const bounds = calendarDayBounds(props.date);
  const layout = layoutDayAppointments(props.appointments, props.date);
  const slots = Array.from({ length: bounds.minutes / 30 }, (_, index) => ({
    minute: index * 30, time: appointmentLocalTime(new Date(bounds.start + index * 30 * 60_000)).slice(11),
  }));
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = (appointmentInstant(`${props.date}T08:00`).getTime() - bounds.start) / 60_000 * PX_PER_MINUTE;
  }, [props.date, bounds.start]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const nowMinute = (now - bounds.start) / 60_000;
  return (
    <section aria-label={`Tageskalender ${longDate(props.date)}`} className="flex min-h-112 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <p className="text-sm text-muted-foreground">Europe/Berlin · Klicke eine Uhrzeit, um Arbeitszeit zu planen.</p>
        <div className="flex gap-2">
          {nowMinute >= 0 && nowMinute < bounds.minutes && <Button size="sm" variant="ghost" onClick={() => { if (scroll.current) scroll.current.scrollTop = Math.max(0, nowMinute - 60) * PX_PER_MINUTE; }}>Jetzt</Button>}
          <Button size="sm" variant="outline" disabled={!props.tasks.length} onClick={() => setPlanning({ time: "09:00" })}><CalendarClock className="size-4" />Zeitblock planen</Button>
        </div>
      </div>
      {props.untimed}
      {!props.tasks.length && <p className="border-b px-3 py-2 text-xs text-muted-foreground">Dir sind keine offenen Aufgaben zugewiesen, für die du Zeitblöcke planen kannst.</p>}
      <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto" data-slot="day-timeline-scroll">
        <div className="relative grid grid-cols-[3.5rem_minmax(0,1fr)]" style={{ height: bounds.minutes * PX_PER_MINUTE }}>
          <div className="relative border-r bg-muted/10" aria-hidden>
            {slots.filter((slot) => slot.time.endsWith(":00")).map((slot) => <span key={slot.minute} className="absolute right-2 text-xs text-muted-foreground tabular-nums" style={{ top: slot.minute * PX_PER_MINUTE + 2 }}>{slot.time}</span>)}
          </div>
          <div className="relative" role="group" aria-label="Uhrzeiten und Termine">
            {slots.map((slot) => <button key={slot.minute} type="button" disabled={!props.tasks.length}
              aria-label={`Zeitblock am ${props.date} um ${slot.time} planen`}
              className="absolute inset-x-0 border-t border-dashed border-border/60 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:z-20 focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-transparent"
              style={{ top: slot.minute * PX_PER_MINUTE, height: 30 * PX_PER_MINUTE, borderTopStyle: slot.time.endsWith(":00") ? "solid" : "dashed" }}
              onClick={() => setPlanning({ time: slot.time })}><span className="sr-only">{slot.time}</span></button>)}
            {layout.map(({ event, start, end, column, columns }) => {
              const from = appointmentLocalTime(event.startsAt);
              const to = appointmentLocalTime(event.endsAt);
              const description = `${event.title}, ${from.slice(11)} – ${to.slice(11)}${event.isPersonal ? ", privat" : ""}`;
              const className = "absolute z-10 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs shadow-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";
              const style = { top: start * PX_PER_MINUTE, height: Math.max((end - start) * PX_PER_MINUTE - 2, 24),
                left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)`,
                borderLeftColor: props.colorOf(event.projectId), backgroundColor: `color-mix(in srgb, ${props.colorOf(event.projectId)} 18%, var(--background))` };
              const content = end - start < 30 ? <span className="block truncate font-medium">{from.slice(11)} {event.title}</span> : <>
                <span className="flex items-center gap-1 font-medium tabular-nums">{event.isPersonal && <LockKeyhole className="size-3 shrink-0" />}{from.slice(0, 10) < props.date ? "00:00" : from.slice(11)} – {to.slice(0, 10) > props.date ? "24:00" : to.slice(11)}</span>
                <span className="block truncate font-medium">{event.title}</span>{end - start >= 45 && <span className="block truncate text-muted-foreground">{event.projectName}{event.isPersonal ? " · nur für dich" : ""}</span>}</>;
              return event.isPersonal && event.canEdit ? <button key={event.id} type="button" className={className} style={style}
                aria-label={`Zeitblock bearbeiten: ${description}`} onClick={() => setPlanning({ time: from.slice(11), appointment: event })}>{content}</button>
                : <Link key={event.id} href={`/projects/${event.projectId}/appointments#${event.id}`} className={className} style={style} aria-label={`Termin: ${description}`}>{content}</Link>;
            })}
            {nowMinute >= 0 && nowMinute < bounds.minutes && <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-destructive" style={{ top: nowMinute * PX_PER_MINUTE }} aria-label="Aktuelle Uhrzeit"><span className="absolute -top-1 -left-1 size-2 rounded-full bg-destructive" /></div>}
          </div>
        </div>
      </div>
      {planning && <TimeBlockDialog key={`${props.date}:${planning.time}:${planning.appointment?.id ?? "new"}`} open date={props.date} time={planning.time} appointment={planning.appointment} tasks={props.tasks} onOpenChange={(open) => { if (!open) setPlanning(null); }} />}
    </section>
  );
}
