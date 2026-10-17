const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD into a UTC day number; null when invalid (e.g. 2026-02-30). */
export function dayNumber(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() !== Number(m) - 1 ||
    check.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return Math.floor(ms / 86_400_000);
}

export function isValidIsoDate(date: string | null | undefined): date is string {
  return dayNumber(date) !== null;
}

/** b − a in whole days; null when either date is invalid. */
export function daysBetween(a: string, b: string): number | null {
  const da = dayNumber(a);
  const db = dayNumber(b);
  return da === null || db === null ? null : db - da;
}

export function addDays(date: string, days: number): string {
  const base = dayNumber(date);
  if (base === null) throw new Error(`invalid date ${date}`);
  return new Date((base + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(isoTimestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoTimestamp));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Budget period of an instant: the calendar month in the organization's time zone, YYYY-MM. */
export function periodKeyOf(isoTimestamp: string, timeZone: string): string {
  return localDate(isoTimestamp, timeZone).slice(0, 7);
}

/** YYYY-MM-DD → YYYY-MM. */
export function periodOfDate(date: string): string {
  return date.slice(0, 7);
}
