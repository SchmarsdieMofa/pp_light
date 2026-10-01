/** Local calendar day as YYYY-MM-DD (not UTC – a task due "today" must not flip at 01:00). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export function isOverdue(dueDate: string | null, isDone: boolean, today: string = todayInZone()): boolean {
  return !!dueDate && !isDone && dueDate < today;
}

/** Browser date inputs report half-typed years (0002-…, 0202-…) as valid dates – ignore those. */
export function isPlausibleDate(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= 1900 && year <= 2999;
}

/** The team's calendar zone: "today" must not depend on where the server runs (Docker defaults to UTC). */
export const APP_TIME_ZONE = "Europe/Berlin";

export function todayInZone(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Sunday of the ISO week containing `iso` (YYYY-MM-DD). */
export function weekEnd(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7));
  return date.toISOString().slice(0, 10);
}
