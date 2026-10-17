/** Numbers and dates the way each country prints them on its own documents. */
import { parseDecimalToMinor, type Country, type Currency } from '@recibido/domain';

export type Lang = 'es' | 'pt' | 'en';

export const LANG: Record<Country, Lang> = { CO: 'es', MX: 'es', BR: 'pt', US: 'en' };

const MONTHS: Record<Lang, string[]> = {
  es: 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(
    ' ',
  ),
  pt: 'janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro'.split(
    ' ',
  ),
  en: 'January February March April May June July August September October November December'.split(
    ' ',
  ),
};

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y: y!, m: m!, d: d! };
};

/** "1 de septiembre de 2026" · "3 de setembro de 2026" · "September 1, 2026" */
export function longDate(iso: string, lang: Lang): string {
  const { y, m, d } = parts(iso);
  return lang === 'en'
    ? `${MONTHS.en[m - 1]} ${d}, ${y}`
    : `${d} de ${MONTHS[lang][m - 1]} de ${y}`;
}

/** "01/09/2026" (day first), or "09/01/2026" in the US */
export function shortDate(iso: string, country: Country): string {
  const { y, m, d } = parts(iso);
  const [dd, mm] = [String(d).padStart(2, '0'), String(m).padStart(2, '0')];
  return country === 'US' ? `${mm}/${dd}/${y}` : `${dd}/${mm}/${y}`;
}

const SEPARATORS: Record<Currency, [thousands: string, decimal: string]> = {
  COP: ['.', ','],
  BRL: ['.', ','],
  MXN: [',', '.'],
  USD: [',', '.'],
};

const group = (whole: string, sep: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

/** COP `$ 18.400.000` · MXN `$12,500.00` · BRL `R$ 4.800,00` · USD `$1,200.00` */
export function formatMoney(value: string, currency: Currency): string {
  const minor = parseDecimalToMinor(value, currency);
  if (minor === null) throw new Error(`not a canonical amount: ${value}`);
  const [thousands, decimal] = SEPARATORS[currency];
  const whole = group(String(Math.floor(Math.abs(minor) / 100)), thousands);
  const cents = String(Math.abs(minor) % 100).padStart(2, '0');
  const sign = minor < 0 ? '-' : '';
  switch (currency) {
    case 'COP': // Colombian documents drop the cents unless there are any
      return `${sign}$ ${whole}${cents === '00' ? '' : `${decimal}${cents}`}`;
    case 'BRL':
      return `${sign}R$ ${whole}${decimal}${cents}`;
    default:
      return `${sign}$${whole}${decimal}${cents}`;
  }
}

/** "38400" → "38.400" in Colombia and Brazil, "38,400" in Mexico and the US */
export function formatQuantity(value: string, currency: Currency): string {
  const [whole = '', frac] = value.split('.');
  const [thousands, decimal] = SEPARATORS[currency];
  return group(whole, thousands) + (frac ? `${decimal}${frac}` : '');
}
