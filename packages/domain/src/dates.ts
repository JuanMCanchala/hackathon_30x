const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

function dayNumber(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`invalid date ${iso}`);
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

/** "2026-10-17" → "2026-10" */
export function periodKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function addDays(iso: string, n: number): string {
  return new Date((dayNumber(iso) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** b − a in whole days (date part only). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** Inclusive date ranges overlap. */
export function overlaps(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  return dayNumber(aFrom) <= dayNumber(bTo) && dayNumber(bFrom) <= dayNumber(aTo);
}
