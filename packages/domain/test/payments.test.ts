import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSUMPTIONS,
  planPayment,
  railFor,
  type Contract,
  type FxSnapshot,
} from '../src/index';

const fx: FxSnapshot = {
  asOf: '2026-10-01',
  perUsd: { USD: '1', COP: '4150', MXN: '18.40', BRL: '5.45' },
};

const contract: Contract = {
  id: 'c1',
  vendorId: 'v1',
  type: 'retainer',
  title: 'Retainer',
  currency: 'COP',
  validFrom: '2026-01-01',
  validTo: null,
  terms: [],
  periodCapMinor: 0,
  netDays: 30,
  earlyPayment: null,
  allowPartial: false,
  vendorResponseDays: 5,
  evidenceRuleText: '',
};

// COP 41.500.000 = USD 10.000,00
const base = {
  amountMinor: 4_150_000_000,
  currency: 'COP' as const,
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  contract,
  today: '2026-10-02T09:00:00Z',
  fx,
};

describe('payment planner', () => {
  it('routes COP over Bre-B, MXN over SPEI, BRL over Pix, USD over ACH', () => {
    expect(railFor('COP')).toBe('bre-b');
    expect(railFor('MXN')).toBe('spei');
    expect(railFor('BRL')).toBe('pix');
    expect(railFor('USD')).toBe('ach');
    expect(DEFAULT_ASSUMPTIONS.text).toMatch(/simulad/i);
  });

  it('pays on the due date when the yield beats the discount', () => {
    const plan = planPayment({
      ...base,
      contract: { ...contract, earlyPayment: { discountBps: 10, withinDays: 10 } },
    });
    expect(plan.payOn).toBe('2026-10-31');
    expect(plan.discountMinor).toBe(0);
    expect(plan.rail).toBe('bre-b');
    expect(plan.reason).toContain('31 oct 2026');
    expect(plan.reason).toContain('vencimiento');
  });

  it('takes the early-payment discount when it is worth more', () => {
    const plan = planPayment({
      ...base,
      contract: { ...contract, earlyPayment: { discountBps: 200, withinDays: 10 } },
    });
    expect(plan.payOn).toBe('2026-10-11');
    expect(plan.discountMinor).toBe(83_000_000);
    expect(plan.usdDebitMinor).toBe(983_430);
  });

  it('never schedules in the past', () => {
    const plan = planPayment({
      ...base,
      issueDate: '2026-09-01',
      dueDate: '2026-09-20',
      today: '2026-10-05',
    });
    expect(plan.payOn).toBe('2026-10-05');
  });

  it('derives the due date from netDays when the bill has none or an earlier one', () => {
    expect(planPayment({ ...base, dueDate: null }).payOn).toBe('2026-10-31');
    expect(planPayment({ ...base, dueDate: '2026-09-01' }).payOn).toBe('2026-10-31');
  });

  it('fees saved against an international wire are positive for local rails', () => {
    const plan = planPayment(base);
    // wire: 3500 + 250 bps of 1.000.000 = 28.500; local: 0 fee + 35 bps = 3.500
    expect(plan.wireCostUsdMinor).toBe(28_500);
    expect(plan.usdDebitMinor).toBe(1_003_500);
    expect(plan.feesSavedUsdMinor).toBe(25_000);
    expect(plan.yieldKeptUsdMinor).toBeGreaterThan(0);
  });

  it('never pays after the due date when the discount window ends later', () => {
    const plan = planPayment({
      ...base,
      dueDate: '2026-10-08',
      contract: { ...contract, earlyPayment: { discountBps: 200, withinDays: 20 } },
    });
    expect(plan.payOn).toBe('2026-10-08');
    expect(plan.discountMinor).toBe(83_000_000);
  });
});
