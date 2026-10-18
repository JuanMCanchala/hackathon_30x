/**
 * Calendar days as YYYY-MM-DD strings and hours as 'HH:MM', both in Bogotá. Day math runs in UTC
 * on the date alone, so no time zone or daylight saving shifts a day.
 */

const DAY_MS = 86_400_000;

export const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toIso(toMs(iso) + n * DAY_MS);
/** The Monday of the week that holds this day. */
export const mondayOf = (iso: string) => addDays(iso, -((new Date(toMs(iso)).getUTCDay() + 6) % 7));
/** 0 is Monday, 6 is Sunday. */
export const weekdayOf = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;

/** Today in Bogotá. */
export const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

const fmtWeekdayShort = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' });
const fmtWeekdayLong = new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' });
const fmtMonthShort = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const fmtMonthLong = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' });

export const dayNum = (iso: string) => Number(iso.slice(8, 10));
export const monthShort = (iso: string) =>
  fmtMonthShort.format(new Date(toMs(iso))).replace('.', '');
/** «lun». */
export const weekdayShort = (iso: string) =>
  fmtWeekdayShort
    .format(new Date(toMs(iso)))
    .replace('.', '')
    .slice(0, 3);
/** «Lun 20». */
export const dayShort = (iso: string) => {
  const w = weekdayShort(iso);
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${dayNum(iso)}`;
};
/** «martes 20 de octubre». */
export const dayLong = (iso: string) =>
  `${fmtWeekdayLong.format(new Date(toMs(iso)))} ${dayNum(iso)} de ${fmtMonthLong.format(new Date(toMs(iso)))}`;
/** «Hoy», «Mañana» or «Lun 20». */
export function dayRelative(iso: string, today = todayIso()): string {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, 1)) return 'Mañana';
  return dayShort(iso);
}

/** '09:00' → «9:00 a. m.»; null → null. */
export function fmtHour(hhmm: string | null | undefined): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
