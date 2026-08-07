/**
 * Date helpers.
 *
 * Everything is handled in UTC at midnight. Weeks are Monday-start (ISO 8601),
 * which is what Screenshot Monitor reports use and what UK payroll expects.
 * Storing dates as @db.Date and always constructing them at T00:00:00Z avoids
 * the classic "the week shifts by one day for anyone east of Greenwich" bug.
 */

export function utcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Monday of the week containing `date`. */
export function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

/** ISO week number and its year (the two can differ around new year). */
export function isoWeekOf(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { isoYear, isoWeek };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 – 12 Apr 2026"  ·  "30 Mar – 5 Apr 2026"  ·  "28 Dec 2026 – 3 Jan 2027" */
export function weekLabel(start: Date, end: Date): string {
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();
  const sm = MONTH_SHORT[start.getUTCMonth()];
  const em = MONTH_SHORT[end.getUTCMonth()];
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();

  if (sy !== ey) return `${sd} ${sm} ${sy} – ${ed} ${em} ${ey}`;
  if (sm !== em) return `${sd} ${sm} – ${ed} ${em} ${ey}`;
  return `${sd} – ${ed} ${sm} ${sy}`;
}

/** "2026-04" */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "2026-Q2" */
export function quarterKey(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${FULL[(m ?? 1) - 1]} ${y}`;
}

/**
 * A week is assigned to the month containing its THURSDAY, matching ISO 8601.
 * This stops a week that straddles a month boundary being counted twice, and
 * means "April" always contains a whole number of weeks.
 */
export function monthKeyForWeek(weekStart: Date): string {
  return monthKey(addDays(weekStart, 3));
}

export function quarterKeyForWeek(weekStart: Date): string {
  return quarterKey(addDays(weekStart, 3));
}

/** Number of Mon–Fri days in the week starting `weekStart`. Always 5 for ISO weeks. */
export const WORKING_DAYS_PER_WEEK = 5;
