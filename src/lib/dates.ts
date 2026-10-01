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

export function isOverdue(dueDate: string | null, isDone: boolean, today: string = todayIso()): boolean {
  return !!dueDate && !isDone && dueDate < today;
}

/** Browser date inputs report half-typed years (0002-…, 0202-…) as valid dates – ignore those. */
export function isPlausibleDate(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= 1900 && year <= 2999;
}
