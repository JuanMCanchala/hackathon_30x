import { describe, expect, it } from 'vitest';
import { clamp, logistic, mean, median, percentile, poissonTail, round, sum } from '../src';

describe('stats', () => {
  it('handles empty inputs as quiet, not as errors', () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(percentile([], 90)).toBe(0);
  });

  it('takes medians of odd and even lists', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('interpolates percentiles between ranks like a spreadsheet', () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 100)).toBe(50);
    expect(percentile(values, 90)).toBeCloseTo(46);
    expect(percentile(values, 10)).toBeCloseTo(14);
    expect(percentile(values, 150)).toBe(50);
  });

  it('clamps, rounds and draws an S-curve', () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(round(1.23456, 2)).toBe(1.23);
    expect(logistic(0)).toBe(0.5);
    expect(logistic(10, 1, 10)).toBe(0.5);
    expect(logistic(100)).toBeCloseTo(1);
  });

  it('gives the Poisson upper tail, also for large counts', () => {
    expect(poissonTail(0, 3)).toBe(1);
    expect(poissonTail(1, 2)).toBeCloseTo(1 - Math.exp(-2), 12);
    expect(poissonTail(5, 1)).toBeCloseTo(0.00365984682734366, 12);
    expect(poissonTail(4, 1.5)).toBeCloseTo(0.06564245437845018, 12);
    expect(poissonTail(3, 0)).toBe(0);
    expect(poissonTail(0, 0)).toBe(1);
    // Page views run in the tens of thousands: e^−λ underflows there, the tail must not.
    expect(poissonTail(10_000, 10_000)).toBeGreaterThan(0.5);
    expect(poissonTail(10_000, 10_000)).toBeLessThan(0.51);
    expect(poissonTail(11_000, 10_000)).toBeGreaterThan(0);
    expect(poissonTail(11_000, 10_000)).toBeLessThan(1e-15);
    expect(poissonTail(9_000, 10_000)).toBeGreaterThan(1 - 1e-15);
  });
});
