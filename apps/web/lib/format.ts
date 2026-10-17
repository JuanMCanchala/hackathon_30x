import {
  formatHours,
  formatMoney,
  parseDecimalToMinor,
  type Currency,
  type Outcome,
} from '@recibido/domain';

export { formatHours, formatMoney };

const CURRENCIES: Currency[] = ['USD', 'COP', 'MXN', 'BRL'];
export const isCurrency = (c: string | null | undefined): c is Currency =>
  CURRENCIES.includes(c as Currency);

const asRead = (value: string) => value.trim().replace(/\.0+$/, '');
const readCurrency = (c: string | null | undefined) => c?.trim().toUpperCase() || null;

/**
 * "COP 20.800.000" from the reading's canonical decimal ("20800000.00"); "1200 (sin moneda)" when
 * the amount was read but its currency was not; "EUR 1200 (moneda no admitida)" for a currency
 * Recibido does not pay in.
 */
export function formatDecimal(value: string | null, currency: string | null): string {
  if (!value?.trim()) return 'Sin leer';
  const read = readCurrency(currency);
  if (!read) return `${asRead(value)} (sin moneda)`;
  if (!isCurrency(read)) return `${read} ${asRead(value)} (moneda no admitida)`;
  const minor = parseDecimalToMinor(value, read);
  return minor === null ? 'Sin leer' : formatMoney(minor, read);
}

/** True when the bill was read in a currency other than the one its contract pays in. */
export function currencyDiffers(read: string | null, contract: Currency | null): boolean {
  return contract !== null && readCurrency(read) !== contract;
}

/**
 * The billed total as the bill states it, never restated in the contract's currency:
 * "1200 (sin moneda; el contrato es en COP)", "USD 1.200 (el contrato es en COP)".
 */
export function formatBilledAsRead(
  value: string | null,
  read: string | null,
  contract: Currency | null,
): string {
  if (!value?.trim() || !contract || !currencyDiffers(read, contract))
    return formatDecimal(value, read);
  if (!readCurrency(read)) return `${asRead(value)} (sin moneda; el contrato es en ${contract})`;
  if (!isCurrency(readCurrency(read))) return formatDecimal(value, read);
  return `${formatDecimal(value, read)} (el contrato es en ${contract})`;
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
/** "16 oct 2026" from a calendar date ("2026-10-16"), read at noon UTC so no zone shifts the day. */
export const formatDay = (isoDate: string) => formatDate(`${isoDate.slice(0, 10)}T12:00:00Z`);

export const RAIL_LABEL: Record<string, string> = {
  'bre-b': 'Bre-B',
  spei: 'SPEI',
  pix: 'Pix',
  ach: 'ACH',
};

/** The five outcomes in the order the product presents them. */
export const OUTCOMES: Outcome[] = ['PAY', 'PAY_PART', 'ASK_VENDOR', 'ESCALATE', 'HOLD'];

/** Who wrote a message. */
export const SENDER = {
  agent: 'Recibido',
  vendor: 'Proveedor',
  person: 'Persona',
  system: 'Sistema',
} as const;

export const CONTRACT_TYPE: Record<string, string> = {
  hourly: 'Por horas',
  milestone: 'Por hitos',
  retainer: 'Cuota fija',
  usage: 'Por uso',
  goods: 'Bienes',
};

export const PAYMENT_STATUS = {
  scheduled: { text: 'Programado', ink: 'text-ink-2' },
  sent: { text: 'Enviado', ink: 'text-pay' },
  returned: { text: 'Devuelto', ink: 'text-escalate' },
} as const;
