/**
 * Small statistics, written out so every number on the radar can be traced by hand. Empty inputs
 * give 0 rather than NaN: an empty week is a quiet week, not an error.
 */

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

/**
 * The p-th percentile (0–100) with linear interpolation between the closest ranks, the same
 * definition spreadsheets and numpy use by default.
 */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (clamp(p, 0, 100) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const weight = rank - low;
  return sorted[low]! + (sorted[high]! - sorted[low]!) * weight;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** An S-curve from 0 to 1: `k` sets the steepness and `midpoint` where it crosses 0.5. */
export function logistic(x: number, k = 1, midpoint = 0): number {
  return 1 / (1 + Math.exp(-k * (x - midpoint)));
}

// Lanczos coefficients (g = 7, n = 9), good to about 15 digits.
const LANCZOS = [
  0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406,
  12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7,
];

/** ln(n!) for n ≥ 0, through the Lanczos approximation of the gamma function. */
function logFactorial(n: number): number {
  let a = LANCZOS[0]!;
  for (let i = 1; i < LANCZOS.length; i += 1) a += LANCZOS[i]! / (n + i);
  const t = n + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (n + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * P(X ≥ k) for X ~ Poisson(mean). It sums the shorter side of the distribution from the term
 * next to k outwards, in logs, so e^−mean never underflows on counts in the tens of thousands.
 */
export function poissonTail(k: number, mean: number): number {
  const n = Math.ceil(k);
  if (n <= 0) return 1;
  if (!(mean > 0)) return 0;
  const upper = n > mean;
  const start = upper ? n : n - 1;
  let term = Math.exp(start * Math.log(mean) - mean - logFactorial(start));
  let total = 0;
  for (let i = start; i >= 0 && term > total * Number.EPSILON;) {
    total += term;
    if (upper) {
      i += 1;
      term *= mean / i;
    } else {
      term *= i / mean;
      i -= 1;
    }
  }
  return upper ? total : 1 - total;
}

export function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
