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

/** ISO day (YYYY-MM-DD) shifted by whole days – UTC arithmetic, so DST never skips or repeats a day. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

function validIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const iso = date.toISOString().slice(0, 10);
  return isPlausibleDate(iso) ? iso : null;
}

/**
 * Typed date → ISO day, or null if it is no real date. Accepts German input ("15.1.2030", "15.01.30",
 * "15.1." = this year) and ISO ("2030-01-15"). `today` supplies the year for the short form.
 */
export function parseDateInput(text: string, today: string = todayInZone()): string | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(value);
  if (!de) return null;
  const year = de[3] === undefined ? Number(today.slice(0, 4)) : de[3].length === 2 ? 2000 + Number(de[3]) : Number(de[3]);
  return validIso(year, Number(de[2]), Number(de[1]));
}
