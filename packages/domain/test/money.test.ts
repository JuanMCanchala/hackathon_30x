import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  minorToDecimal,
  parseDecimalToMinor,
  toleranceBounds,
  toUsdCentsCeil,
} from '../src';
import { POLICY } from './fixtures';

describe('parseDecimalToMinor', () => {
  it('parses canonical decimals into minor units', () => {
    expect(parseDecimalToMinor('14000000.00', 'COP')).toBe(1_400_000_000);
    expect(parseDecimalToMinor('72000', 'MXN')).toBe(7_200_000);
    expect(parseDecimalToMinor('504.5', 'USD')).toBe(50_450);
    expect(parseDecimalToMinor('0.10', 'USD')).toBe(10);
    expect(parseDecimalToMinor('-25.00', 'USD')).toBe(-2_500);
  });

  it('rejects formats it must not guess at', () => {
    expect(parseDecimalToMinor('1,200.50', 'USD')).toBeNull();
    expect(parseDecimalToMinor('1.200,50', 'USD')).toBeNull();
    expect(parseDecimalToMinor('12.345', 'USD')).toBeNull();
    expect(parseDecimalToMinor('USD 12', 'USD')).toBeNull();
    expect(parseDecimalToMinor(null, 'USD')).toBeNull();
  });

  it('round-trips through minorToDecimal', () => {
    expect(minorToDecimal(1_400_000_000, 'COP')).toBe('14000000.00');
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(-2_500, 'USD')).toBe('-25.00');
  });
});

describe('toUsdCentsCeil', () => {
  it('converts with the policy snapshot', () => {
    expect(toUsdCentsCeil(1_400_000_000, 'COP', POLICY.fx)).toBe(350_000);
    expect(toUsdCentsCeil(1_620_000, 'BRL', POLICY.fx)).toBe(300_000);
  });

  it('rounds up so a bill never looks cheaper than it is', () => {
    // MXN 72,000 / 18.50 = USD 3,891.8918… = 389,189.19 cents → 389,190
    expect(toUsdCentsCeil(7_200_000, 'MXN', POLICY.fx)).toBe(389_190);
    expect(toUsdCentsCeil(1, 'COP', POLICY.fx)).toBe(1);
  });

  it('returns null without a rate', () => {
    expect(toUsdCentsCeil(100, 'PEN', POLICY.fx)).toBeNull();
  });
});

describe('toleranceBounds', () => {
  it('is conservative at the edges', () => {
    expect(toleranceBounds(48_000, 10)).toEqual({ min: 43_200, max: 52_800 });
    expect(toleranceBounds(333, 10)).toEqual({ min: 300, max: 366 });
    expect(toleranceBounds(100, 0)).toEqual({ min: 100, max: 100 });
  });
});

describe('formatMoney', () => {
  it('uses ISO codes and Colombian grouping', () => {
    expect(formatMoney(1_400_000_000, 'COP')).toBe('COP 14.000.000');
    expect(formatMoney(350_000, 'USD')).toBe('USD 3.500,00');
    expect(formatMoney(7_200_000, 'MXN')).toBe('MXN 72.000,00');
  });
});
