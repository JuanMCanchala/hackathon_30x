import { describe, expect, it } from 'vitest';
import { reconcile, planPayment, type BankLine, type Payment } from '../src/index';

const plan = planPayment({
  amountMinor: 100_000,
  currency: 'USD',
  issueDate: '2026-10-01',
  dueDate: '2026-10-31',
  contract: {
    id: 'c',
    vendorId: 'v',
    type: 'retainer',
    title: 't',
    currency: 'USD',
    validFrom: '2026-01-01',
    validTo: null,
    terms: [],
    periodCapMinor: 0,
    netDays: 30,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText: '',
  },
  today: '2026-10-02',
  fx: { asOf: '2026-10-01', perUsd: { USD: '1', COP: '4150', MXN: '18.40', BRL: '5.45' } },
});

const pay = (over: Partial<Payment> = {}): Payment => ({
  id: 'p1',
  billId: 'b1',
  vendorId: 'v',
  contractId: 'c',
  amountMinor: 100_000,
  currency: 'USD',
  destination: 'x',
  rail: 'ach',
  decidedBy: 'agent',
  decisionId: null,
  scheduledFor: '2026-10-31',
  executedAt: '2026-10-31T10:00:00Z',
  status: 'sent',
  plan: { ...plan, usdDebitMinor: 100_000 },
  reference: 'RCB-0001',
  ...over,
});

const line = (over: Partial<BankLine> = {}): BankLine => ({
  id: 'l1',
  date: '2026-10-31',
  description: 'ACH OUT RCB-0001 Vendor',
  amountUsdMinor: -100_000,
  kind: 'debit',
  ...over,
});

describe('reconcile', () => {
  it('matches by reference', () => {
    const r = reconcile([pay()], [line()]);
    expect(r.matches[0]).toMatchObject({ paymentId: 'p1', status: 'matched', fxDiffUsdMinor: 0 });
    expect(r.unmatchedPayments).toEqual([]);
  });

  it('flags the FX difference', () => {
    const r = reconcile([pay()], [line({ amountUsdMinor: -100_420 })]);
    expect(r.matches[0]).toMatchObject({ status: 'matched_fx', fxDiffUsdMinor: 420 });
  });

  it('links the fee line', () => {
    const r = reconcile(
      [pay()],
      [
        line(),
        line({ id: 'l2', kind: 'fee', description: 'WIRE FEE RCB-0001', amountUsdMinor: -50 }),
      ],
    );
    expect(r.matches[1]).toMatchObject({ paymentId: 'p1', status: 'fee' });
  });

  it('marks a returned payment', () => {
    const r = reconcile(
      [pay()],
      [
        line(),
        line({ id: 'l2', kind: 'return', description: 'RETURN RCB-0001', amountUsdMinor: 100_000 }),
      ],
    );
    expect(r.matches[1]).toMatchObject({ paymentId: 'p1', status: 'returned' });
  });

  it('matches by amount and date when the reference is missing', () => {
    const r = reconcile(
      [pay()],
      [line({ description: 'ACH OUT Vendor', amountUsdMinor: -100_800, date: '2026-11-02' })],
    );
    expect(r.matches[0]).toMatchObject({
      paymentId: 'p1',
      status: 'matched_fx',
      fxDiffUsdMinor: 800,
    });
    expect(r.unmatchedPayments).toEqual([]);
  });

  it('flags an unknown card charge as unmatched', () => {
    const r = reconcile(
      [pay()],
      [line(), line({ id: 'l3', kind: 'card', description: 'AWS', amountUsdMinor: -100_000 })],
    );
    expect(r.matches[1]).toMatchObject({ paymentId: null, status: 'unmatched' });
  });

  it('lists a sent payment with no bank line', () => {
    const r = reconcile([pay(), pay({ id: 'p2', reference: 'RCB-0002' })], [line()]);
    expect(r.unmatchedPayments).toEqual(['p2']);
  });

  it('matches a reference only as a whole token', () => {
    const r = reconcile(
      [pay()],
      [line({ kind: 'fee', description: 'WIRE FEE RCB-00011', amountUsdMinor: -50 })],
    );
    expect(r.matches[0]).toMatchObject({ paymentId: null, status: 'unmatched' });
  });

  it('ignores an empty reference', () => {
    const r = reconcile([pay({ reference: '' })], [line({ kind: 'fee', amountUsdMinor: -50 })]);
    expect(r.matches[0]).toMatchObject({ paymentId: null, status: 'unmatched' });
  });

  it('writes the FX difference as money', () => {
    const r = reconcile([pay()], [line({ amountUsdMinor: -100_420 })]);
    expect(r.matches[0]?.note).toContain('USD 4,20');
  });
});
