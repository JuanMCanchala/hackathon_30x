import { describe, expect, it } from 'vitest';
import { clamp, logistic, mean, median, percentile, round, sum } from '../src';

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
});
