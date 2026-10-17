import type { FxSnapshot } from './schemas';

/** ISO 4217 minor-unit exponents for the currencies we handle; default 2. */
const EXPONENTS: Record<string, number> = {
  USD: 2,
  COP: 2,
  MXN: 2,
  BRL: 2,
  ARS: 2,
  PEN: 2,
  CLP: 0,
  EUR: 2,
};

export function currencyExponent(currency: string): number {
  return EXPONENTS[currency] ?? 2;
}

const DECIMAL = /^(-)?(\d+)(?:\.(\d+))?$/;

/**
 * Parses a canonical decimal string ("14000000.00") into integer minor units.
 * Returns null for anything that is not canonical or has more precision than the currency allows
 * (a reader that returns "1,200.5" or "12.345" for USD produced something we must not guess at).
 */
export function parseDecimalToMinor(
  value: string | null | undefined,
  currency: string,
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
export function minorToDecimal(amountMinor: number, currency: string): string {
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

function divCeil(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('denominator must be positive');
  if (numerator >= 0n) return (numerator + denominator - 1n) / denominator;
  return -(-numerator / denominator);
}

/**
 * Converts an amount to USD cents using the policy's FX snapshot, rounding **up**: when compared
 * with a limit, a bill is never made to look cheaper than it is (ADR-0007).
 * Returns null when the snapshot has no rate for the currency.
 */
export function toUsdCentsCeil(
  amountMinor: number,
  currency: string,
  fx: FxSnapshot,
): number | null {
  if (currency === 'USD') return amountMinor;
  const raw = fx.unitsPerUsd[currency];
  if (raw == null) return null;
  const rate = decimalToRational(raw);
  if (!rate || rate.numerator === 0n) return null;
  // usdCents = amountMinor / 10^exp / (numerator/scale) * 100
  const exponentScale = 10n ** BigInt(currencyExponent(currency));
  const result = divCeil(BigInt(amountMinor) * 100n * rate.scale, exponentScale * rate.numerator);
  return Number(result);
}

/** Converts USD cents to an amount in another currency, rounding down (used only for display). */
export function fromUsdCentsFloor(
  usdCents: number,
  currency: string,
  fx: FxSnapshot,
): number | null {
  if (currency === 'USD') return usdCents;
  const raw = fx.unitsPerUsd[currency];
  if (raw == null) return null;
  const rate = decimalToRational(raw);
  if (!rate) return null;
  const exponentScale = 10n ** BigInt(currencyExponent(currency));
  return Number((BigInt(usdCents) * rate.numerator * exponentScale) / (100n * rate.scale));
}

/** Integer percentage bounds, conservative: the allowed range never grows because of rounding. */
export function toleranceBounds(
  amountMinor: number,
  tolerancePct: number,
): { min: number; max: number } {
  const basisPoints = BigInt(Math.round(tolerancePct * 100));
  const amount = BigInt(amountMinor);
  const min = divCeil(amount * (10000n - basisPoints), 10000n);
  const max = (amount * (10000n + basisPoints)) / 10000n;
  return { min: Number(min), max: Number(max) };
}
