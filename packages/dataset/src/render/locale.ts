/** Formatting the way each country prints its own documents. */
import { parseDecimalToMinor } from '@mandato/domain';

const MONTHS_ES = [
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
const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y: y!, m: m!, d: d! };
}

export const dateLongEs = (date: string) => {
  const { y, m, d } = parts(date);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
};
export const dateEn = (date: string) => {
  const { y, m, d } = parts(date);
  return `${MONTHS_EN[m - 1]} ${d}, ${y}`;
};
export const dateNumeric = (date: string) => {
  const { y, m, d } = parts(date);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
};

function grouped(
  value: string,
  currency: string,
  thousands: string,
  decimal: string,
  decimals: number,
) {
  const minor = parseDecimalToMinor(value, currency);
  if (minor === null) return value;
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
  const cents = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}${decimals ? `${decimal}${cents}` : ''}`;
}

/** Colombia: $14.000.000 (no cents when zero) */
export const moneyCO = (value: string) => {
  const minor = parseDecimalToMinor(value, 'COP') ?? 0;
  return `$${grouped(value, 'COP', '.', ',', minor % 100 === 0 ? 0 : 2)}`;
};
/** México: $72,000.00 */
export const moneyMX = (value: string) => `$${grouped(value, 'MXN', ',', '.', 2)}`;
/** Brasil: R$ 16.200,00 */
export const moneyBR = (value: string, currency = 'BRL') =>
  currency === 'BRL'
    ? `R$ ${grouped(value, 'BRL', '.', ',', 2)}`
    : `${currency} ${grouped(value, currency, '.', ',', 2)}`;
/** Estados Unidos: $1,940.50 */
export const moneyUS = (value: string) => `$${grouped(value, 'USD', ',', '.', 2)}`;
/** Perú: S/ 9,000.00 */
export const moneyPE = (value: string) => `S/ ${grouped(value, 'PEN', ',', '.', 2)}`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deterministic pseudo-random hex derived from a seed (fictitious CUFE / UUID). */
export function fakeHex(seed: string, length: number): string {
  let h = 2166136261;
  let out = '';
  while (out.length < length) {
    for (const ch of seed + out.length) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
}

export function fakeUuid(seed: string): string {
  const hex = fakeHex(seed, 32).toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
