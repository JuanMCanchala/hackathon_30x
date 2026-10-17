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

export function round(x: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
