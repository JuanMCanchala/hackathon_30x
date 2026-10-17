import { describe, expect, it } from 'vitest';
import {
  convertToUsdMinor,
  formatMoney,
  minorToDecimal,
  parseDecimalToMinor,
  type FxSnapshot,
} from '../src/index';

const fx: FxSnapshot = {
  asOf: '2026-10-01',
  perUsd: { USD: '1', COP: '4150', MXN: '18.40', BRL: '5.45' },
};

describe('money', () => {
  it('parses canonical decimals to minor units', () => {
    expect(parseDecimalToMinor('18400000.00', 'COP')).toBe(1840000000);
  });
  it('rejects non-canonical or over-precise values', () => {
    expect(parseDecimalToMinor('1,200.5', 'USD')).toBeNull();
    expect(parseDecimalToMinor('12.345', 'USD')).toBeNull();
  });
  it('formats minor units as canonical decimals', () => {
    expect(minorToDecimal(123450, 'USD')).toBe('1234.50');
  });
  it('converts to USD cents rounding up', () => {
    expect(convertToUsdMinor(1840000000, 'COP', fx)).toBe(443374);
    expect(convertToUsdMinor(100, 'USD', fx)).toBe(100);
  });
  it('formats for Spanish display', () => {
    expect(formatMoney(1840000000, 'COP')).toBe('COP 18.400.000');
    expect(formatMoney(125000, 'USD')).toBe('USD 1.250,00');
  });
});
