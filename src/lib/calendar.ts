import { addDays, weekStart } from "@/lib/dates";

export const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** "YYYY-MM" of an ISO day. */
export const monthOf = (iso: string) => iso.slice(0, 7);

export function shiftMonth(month: string, amount: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + amount, 1)).toISOString().slice(0, 7);
}

/** 42 ISO days (6 weeks, Monday first) covering `month` ("YYYY-MM"). */
export function monthGrid(month: string): string[] {
  const first = weekStart(`${month}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

function utc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Montag, 5. Oktober 2026" */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utc(iso));
}

/** ISO 8601 week number: the week belongs to the year of its Thursday. */
export function isoWeek(iso: string): number {
  const thursday = utc(addDays(iso, 3 - weekdayIndex(iso)));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return 1 + Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7);
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(iso: string): number {
  return (utc(iso).getUTCDay() + 6) % 7;
}
