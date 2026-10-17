import { currencyExponent } from './money';

/** Currencies whose cents are omitted in Spanish copy when they are zero. */
const HIDE_ZERO_CENTS = new Set(['COP', 'CLP']);

/** "USD 3.500,00", "COP 14.000.000", "MXN 72.000,00". ISO codes avoid the ambiguous "$". */
export function formatMoney(amountMinor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  const value = amountMinor / 10 ** exponent;
  const hideCents = HIDE_ZERO_CENTS.has(currency) && amountMinor % 10 ** exponent === 0;
  const digits = hideCents ? 0 : exponent;
  const number = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${currency} ${number}`;
}

export function formatUsd(usdCents: number): string {
  return formatMoney(usdCents, 'USD');
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-09-03" → "3 sep 2026". */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!y || !month || !d) return date;
  return `${Number(d)} ${month} ${y}`;
}

/** "2026-10" → "octubre 2026". */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-');
  const month = MONTHS_LONG[Number(m) - 1];
  return month && y ? `${month} ${y}` : period;
}

/** "2026-10" → "octubre". */
export function formatPeriodMonth(period: string): string {
  const month = MONTHS_LONG[Number(period.split('-')[1]) - 1];
  return month ?? period;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value * 100)} %`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function joinSpanish(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

const METHOD_LABELS: Record<string, string> = {
  bre_b: 'llave Bre-B',
  spei: 'CLABE (SPEI)',
  pix: 'chave Pix',
  ach: 'cuenta ACH',
  wire: 'cuenta (wire)',
  card: 'tarjeta',
  other: 'cuenta',
};

export function payoutMethodLabel(method: string | null | undefined): string {
  return (method && METHOD_LABELS[method]) ?? 'datos de pago';
}
