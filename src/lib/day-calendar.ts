import { addDays } from "@/lib/dates";
import { appointmentInstant } from "@/lib/schemas/appointment";

export function calendarDayBounds(date: string) {
  const start = appointmentInstant(`${date}T00:00`).getTime();
  const end = appointmentInstant(`${addDays(date, 1)}T00:00`).getTime();
  return { start, end, minutes: (end - start) / 60_000 };
}

/** Connected overlaps share a lane group. Adjacent appointments can use the same lane. */
export function layoutDayAppointments<T extends { id: string; startsAt: string; endsAt: string }>(events: T[], date: string) {
  const bounds = calendarDayBounds(date);
  const items = events.map((event) => ({ event,
    start: (Math.max(Date.parse(event.startsAt), bounds.start) - bounds.start) / 60_000,
    end: (Math.min(Date.parse(event.endsAt), bounds.end) - bounds.start) / 60_000,
    column: 0, columns: 1,
  })).filter((item) => item.end > item.start).sort((a, b) => a.start - b.start || b.end - a.end || a.event.id.localeCompare(b.event.id));
  let group: typeof items = [];
  let lanes: number[] = [];
  let until = -1;
  const finish = () => { for (const item of group) item.columns = lanes.length; };
  for (const item of items) {
    if (item.start >= until) { finish(); group = []; lanes = []; }
    let column = lanes.findIndex((end) => end <= item.start);
    if (column < 0) column = lanes.length;
    lanes[column] = item.end;
    item.column = column;
    until = Math.max(item.start >= until ? -1 : until, item.end);
    group.push(item);
  }
  finish();
  return items;
}
