export type Currency = 'USD' | 'COP' | 'MXN' | 'BRL';

/** units of each currency per 1 USD, canonical decimals */
export interface FxSnapshot {
  asOf: string;
  perUsd: Record<Currency, string>;
}

/** All handled currencies use two minor-unit digits (COP included, as in ISO 4217). */
export function currencyExponent(_currency: Currency): number {
  return 2;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a canonical decimal string ("14000000.00") into integer minor units.
 * Returns null for anything that is not canonical or has more precision than the currency allows
 * (a reader that returns "1,200.5" or "12.345" for USD produced something we must not guess at).
 */
export function parseDecimalToMinor(
  value: string | null | undefined,
  currency: Currency,
): number | null {
  if (value == null) return null;
  const match = DECIMAL.exec(value.trim());
  if (!match) return null;
  const [, sign, whole = '0', frac = ''] = match;
  const exponent = currencyExponent(currency);
  const significant = frac.replace(/0+$/, '');
  if (significant.length > exponent) return null;
  const minor =
    BigInt(whole) * 10n ** BigInt(exponent) +
    BigInt((significant || '0').padEnd(exponent, '0') || '0');
  const signed = sign ? -minor : minor;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER))
    return null;
  return Number(signed);
}

/** Inverse of {@link parseDecimalToMinor}: integer minor units → canonical decimal string. */
export function minorToDecimal(amountMinor: number, currency: Currency): string {
  const exponent = currencyExponent(currency);
  const negative = amountMinor < 0;
  const digits = Math.abs(amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const whole = exponent === 0 ? digits : digits.slice(0, -exponent);
  const frac = exponent === 0 ? '' : `.${digits.slice(-exponent)}`;
  return `${negative ? '-' : ''}${whole}${frac}`;
}

function decimalToRational(value: string): { numerator: bigint; scale: bigint } | null {
  const match = DECIMAL.exec(value.trim());
  if (!match || match[1]) return null;
  const [, , whole = '0', frac = ''] = match;
  return { numerator: BigInt(whole + frac), scale: 10n ** BigInt(frac.length) };
}

/**
 * Converts an amount to USD cents using the FX snapshot, rounding **up**: compared with a limit,
 * a bill is never made to look cheaper than it is. Throws when the snapshot has no usable rate.
 */
export function convertToUsdMinor(amountMinor: number, currency: Currency, fx: FxSnapshot): number {
  if (currency === 'USD') return amountMinor;
  const rate = decimalToRational(fx.perUsd[currency] ?? '');
  if (!rate || rate.numerator === 0n) throw new Error(`No usable FX rate for ${currency}`);
  // usdCents = amountMinor / 10^exp / (numerator/scale) * 100
  const num = BigInt(amountMinor) * 100n * rate.scale;
  const den = 10n ** BigInt(currencyExponent(currency)) * rate.numerator;
  return Number(num >= 0n ? (num + den - 1n) / den : -(-num / den));
}

/** Spanish display: `COP 18.400.000`, `USD 1.250,00`. COP drops the cents when they are zero. */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const [whole = '0', frac = '00'] = minorToDecimal(Math.abs(amountMinor), currency).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+$)/g, '.');
  const cents = currency === 'COP' && frac === '00' ? '' : `,${frac}`;
  return `${currency} ${amountMinor < 0 ? '-' : ''}${grouped}${cents}`;
}
