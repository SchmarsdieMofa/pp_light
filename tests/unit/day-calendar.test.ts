import { describe, expect, it } from "vitest";
import { calendarDayBounds, layoutDayAppointments } from "@/lib/day-calendar";
import { appointmentInstant } from "@/lib/schemas/appointment";

const event = (id: string, start: string, end: string) => ({ id, startsAt: appointmentInstant(start).toISOString(), endsAt: appointmentInstant(end).toISOString() });

describe("daily time grid", () => {
  it("places intersecting meetings beside one another and reuses lanes for adjacent meetings", () => {
    const rows = layoutDayAppointments([
      event("a", "2030-01-15T09:00", "2030-01-15T11:00"),
      event("b", "2030-01-15T09:30", "2030-01-15T10:00"),
      event("c", "2030-01-15T10:00", "2030-01-15T10:30"),
      event("d", "2030-01-15T11:00", "2030-01-15T12:00"),
    ], "2030-01-15");
    expect(rows.map((r) => [r.event.id, r.start, r.end, r.column, r.columns])).toEqual([
      ["a", 540, 660, 0, 2], ["b", 570, 600, 1, 2], ["c", 600, 630, 1, 2], ["d", 660, 720, 0, 1],
    ]);
  });

  it("clips midnight-spanning events to the visible day and excludes exact midnight ends", () => {
    const rows = layoutDayAppointments([
      event("before", "2030-01-14T23:00", "2030-01-15T00:00"),
      event("across", "2030-01-14T23:00", "2030-01-15T01:00"),
      event("after", "2030-01-15T23:00", "2030-01-16T01:00"),
    ], "2030-01-15");
    expect(rows.map((r) => [r.event.id, r.start, r.end])).toEqual([["across", 0, 60], ["after", 1380, 1440]]);
  });

  it("uses the real 23- or 25-hour day across Berlin DST changes", () => {
    expect(calendarDayBounds("2026-03-29").minutes).toBe(1380);
    expect(calendarDayBounds("2026-10-25").minutes).toBe(1500);
    const [row] = layoutDayAppointments([event("dst", "2026-03-29T01:30", "2026-03-29T03:30")], "2026-03-29");
    expect(row.end - row.start).toBe(60);
  });
});
