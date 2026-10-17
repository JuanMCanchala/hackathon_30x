import { describe, expect, it } from 'vitest';
import {
  RAILS,
  addBusinessDays,
  expectedSettlement,
  nextBusinessDay,
  paymentDate,
  transferReference,
} from '../src/payments';

describe('when a decided bill is paid', () => {
  it('pays on the due date, not before', () => {
    expect(paymentDate('2026-08-17', '2026-08-03')).toBe('2026-08-17');
  });

  it('pays at once when the bill is already due or has no due date', () => {
    expect(paymentDate('2026-08-01', '2026-08-03')).toBe('2026-08-03');
    expect(paymentDate(null, '2026-08-04')).toBe('2026-08-04');
  });

  it('moves weekends to the next Monday', () => {
    // 15 and 16 August 2026 are a Saturday and a Sunday.
    expect(nextBusinessDay('2026-08-15')).toBe('2026-08-17');
    expect(nextBusinessDay('2026-08-16')).toBe('2026-08-17');
    expect(paymentDate('2026-08-15', '2026-08-03')).toBe('2026-08-17');
  });
});

describe('rails', () => {
  it('settles local instant rails the same day and ACH and wires later', () => {
    expect(expectedSettlement(RAILS.bre_b, '2026-08-14')).toBe('2026-08-14');
    expect(expectedSettlement(RAILS.spei, '2026-08-14')).toBe('2026-08-14');
    // Friday → Monday, Friday → Tuesday.
    expect(expectedSettlement(RAILS.ach, '2026-08-14')).toBe('2026-08-17');
    expect(expectedSettlement(RAILS.wire, '2026-08-14')).toBe('2026-08-18');
    expect(addBusinessDays('2026-08-13', 2)).toBe('2026-08-17');
  });

  it('builds a readable, deterministic transfer reference', () => {
    expect(transferReference(RAILS.bre_b, 'MND-0004', '2026-08-03')).toBe('BREB-20260803-MND0004');
    expect(transferReference(RAILS.wire, 'MND-0007', '2026-08-03')).toMatch(/^SWIFT-/);
  });
});
