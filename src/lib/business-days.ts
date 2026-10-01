/** Calendar arithmetic uses UTC noon so local daylight-saving changes cannot alter a date. */
function parseDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Ungültiges Datum.");
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) throw new Error("Ungültiges Datum.");
  return date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(start: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error("Ungültige Anzahl Arbeitstage.");
  const date = parseDate(start);
  const step = Math.sign(days);
  for (let remaining = Math.abs(days); remaining > 0;) {
    date.setUTCDate(date.getUTCDate() + step);
    if (isWeekday(date)) remaining--;
  }
  return iso(date);
}

export function earliestStart(blockerDue: string, lagDays: number): string {
  if (!Number.isSafeInteger(lagDays) || lagDays < 0) throw new Error("Ungültiger Abstand.");
  return addBusinessDays(blockerDue, lagDays + 1);
}

/** Inclusive workday duration; weekend-only manual spans still count as one day. */
export function businessDaysInclusive(start: string, end: string): number {
  const date = parseDate(start);
  const last = parseDate(end);
  if (date > last) throw new Error("Der Start liegt nach dem Ende.");
  let count = 0;
  while (date <= last) {
    if (isWeekday(date)) count++;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

export function endForStart(start: string, duration: number): string {
  if (!Number.isSafeInteger(duration) || duration < 1) throw new Error("Ungültige Dauer.");
  if (!isWeekday(parseDate(start))) throw new Error("Der neue Start muss ein Arbeitstag sein.");
  return addBusinessDays(start, duration - 1);
}
