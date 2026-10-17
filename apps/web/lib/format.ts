import { formatHours, formatMoney, parseDecimalToMinor, type Currency } from '@recibido/domain';

export { formatHours, formatMoney };

const CURRENCIES: Currency[] = ['USD', 'COP', 'MXN', 'BRL'];
export const isCurrency = (c: string | null | undefined): c is Currency =>
  CURRENCIES.includes(c as Currency);

/** "COP 20.800.000" from the reading's canonical decimal ("20800000.00"). */
export function formatDecimal(value: string | null, currency: string | null): string {
  if (!isCurrency(currency)) return 'Sin leer';
  const minor = parseDecimalToMinor(value, currency);
  return minor === null ? 'Sin leer' : formatMoney(minor, currency);
}

const TZ = 'America/Bogota';
const day = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: TZ,
});
const dayTime = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: TZ,
});

// es-CO abbreviates months with a period ("oct."); the ledger reads cleaner without it.
const clean = (s: string) => s.replace(/\./g, '').replace(/\s+de\s+/g, ' ');

/** "3 oct 2026": the demo runs on Altamar's clock, shown in Colombia time. */
export const formatDate = (iso: string) => clean(day.format(new Date(iso)));
/** "3 oct, 09:00" */
export const formatDateTime = (iso: string) => clean(dayTime.format(new Date(iso)));

export const formatPct = (pct: number) => `${pct.toLocaleString('es-CO')} %`;
