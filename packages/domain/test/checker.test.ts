import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInvariants, type CheckerInput } from '../src/checker';
import { scorecard } from '../src/metrics';
import type { Payment, PaymentPlan } from '../src/payments';
import { DEFAULT_POLICY, type ExtractedBill } from '../src/types';
import {
  CONTRACTS,
  FX,
  hourlyBill,
  hourlyContract,
  hoursLine,
  nimbus,
  ospina,
  RATE_MINOR,
  retainerBill,
  retainerContract,
  timeEntries,
  VENDORS,
} from './fixtures';

type CheckerBill = CheckerInput['bills'][number];

const PLAN: PaymentPlan = {
  rail: 'bre-b',
  payOn: '2026-11-15',
  reason: '',
  amountMinor: 0,
  discountMinor: 0,
  usdDebitMinor: 0,
  feeUsdMinor: 0,
  wireCostUsdMinor: 0,
  feesSavedUsdMinor: 0,
  yieldKeptUsdMinor: 0,
};

function paidBill(
  id: string,
  reading: ExtractedBill,
  payNowMinor: number,
  over: Partial<CheckerBill> = {},
): CheckerBill {
  const vendorId = reading.currency === 'USD' ? nimbus.id : ospina.id;
  const contract = vendorId === nimbus.id ? retainerContract : hourlyContract;
  return {
    id,
    vendorId,
    contractId: contract.id,
    reading,
    status: 'PAID',
    chain: [id],
    matches: reading.lines.map((_, i) => ({
      lineIndex: i,
      termId: contract.terms[0]!.id,
      confidence: 0.95,
      reason: 'test',
    })),
    decisions: [{ id: `d-${id}`, outcome: 'PAY', payNowMinor }],
    ...over,
  };
}

function payment(b: CheckerBill, amountMinor: number, over: Partial<Payment> = {}): Payment {
  const vendor = VENDORS.find((v) => v.id === b.vendorId)!;
  return {
    id: `p-${b.id}`,
    billId: b.id,
    vendorId: vendor.id,
    contractId: b.contractId,
    amountMinor,
    currency: vendor.payout.currency,
    destination: vendor.payout.destination,
    rail: vendor.payout.rail,
    decidedBy: 'agent',
    decisionId: b.decisions[0]?.id ?? null,
    scheduledFor: '2026-11-15',
    executedAt: null,
    status: 'scheduled',
    plan: { ...PLAN, amountMinor },
    reference: `RCB-${b.id}`,
    ...over,
  };
}

function input(
  bills: CheckerBill[],
  payments: Payment[],
  evidence = timeEntries(120),
): CheckerInput {
  return {
    vendors: VENDORS,
    contracts: CONTRACTS,
    evidence,
    payments,
    bills,
    fx: FX,
    policy: DEFAULT_POLICY,
  };
}

const invariants = (i: CheckerInput) => checkInvariants(i).map((v) => v.invariant);

describe('checkInvariants', () => {
  const small = 10 * RATE_MINOR; // COP 1.150.000 ≈ USD 287,50

  it('passes a clean set of payments', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    const n = paidBill('b2', retainerBill(), 120_000);
    expect(checkInvariants(input([b, n], [payment(b, small), payment(n, 120_000)]))).toEqual([]);
  });

  it('I1: flags a payment to a destination that is not the registered one', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    const v = checkInvariants(input([b], [payment(b, small, { destination: '9876543210' })]));
    expect(v.map((x) => x.invariant)).toEqual(['I1']);
    expect(v[0]).toMatchObject({ billId: 'b1', paymentId: 'p-b1' });
  });

  it('I1 also binds payments a person approved', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    const p = payment(b, small, {
      destination: '9876543210',
      decidedBy: 'person',
      decisionId: null,
    });
    expect(invariants(input([b], [p]))).toEqual(['I1']);
  });

  it('I2: flags an agent payment without a matching PAY decision', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    expect(invariants(input([b], [payment(b, small, { decisionId: 'nope' })]))).toEqual(['I2']);
    const asked = paidBill('b1', hourlyBill('10'), small, {
      decisions: [{ id: 'd-b1', outcome: 'ASK_VENDOR', payNowMinor: small }],
    });
    expect(invariants(input([asked], [payment(asked, small)]))).toEqual(['I2']);
    expect(invariants(input([b], [payment(b, small - 1)]))).toEqual(['I2']);
  });

  it('I3: flags a payment above the evidenced hours', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    expect(invariants(input([b], [payment(b, small)], timeEntries(6)))).toEqual(['I3']);
  });

  it('I3: counts only the vendor’s own time entries inside the period', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    const others = timeEntries(10, '2026-10-01', 'v-otro');
    const late = timeEntries(10, '2026-11-05');
    expect(invariants(input([b], [payment(b, small)], [...others, ...late]))).toEqual(['I3']);
  });

  it('I3: sums agent payments across a corrected bill’s chain', () => {
    const orig = paidBill('b1', hourlyBill('10'), small, { status: 'SUPERSEDED' });
    const rev = paidBill('b2', hourlyBill('10', { revisionOf: 'DO-2026-10' }), small, {
      chain: ['b2', 'b1'],
    });
    // the revision pays the whole bill again: twice the evidenced amount on one chain
    const v = checkInvariants(input([orig, rev], [payment(orig, small), payment(rev, small)]));
    expect(v.map((x) => x.invariant)).toEqual(['I3']);
    expect(v[0]?.paymentId).toBe('p-b2');
  });

  it('I3: a later revision that bills less does not re-judge an earlier payment', () => {
    const orig = paidBill('b1', hourlyBill('10'), small, { status: 'SUPERSEDED' });
    const rev = paidBill('b2', hourlyBill('5', { revisionOf: 'DO-2026-10' }), 0, {
      status: 'ESCALATED',
      chain: ['b2', 'b1'],
      decisions: [],
    });
    expect(invariants(input([orig, rev], [payment(orig, small)]))).toEqual([]);
  });

  it('a person payment is exempt from I3', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    const p = payment(b, small, { decidedBy: 'person', decisionId: null });
    expect(invariants(input([b], [p], []))).toEqual([]);
  });

  it('I4: flags a unit price above the contract rate', () => {
    const line = hoursLine('10', '120000.00');
    const reading = hourlyBill('10', { lines: [line], total: line.amount! });
    const b = paidBill('b1', reading, 120_000_000);
    expect(invariants(input([b], [payment(b, 120_000_000)]))).toEqual(['I4']);
  });

  it('I4: flags agent payments above the monthly cap of the contract', () => {
    const a = paidBill('b1', retainerBill(), 120_000);
    const b = paidBill('b2', retainerBill({ invoiceNumber: 'NIM-2026-10-B' }), 120_000);
    const v = checkInvariants(input([a, b], [payment(a, 120_000), payment(b, 120_000)]));
    expect(v.map((x) => x.invariant)).toEqual(['I4']);
    expect(v[0]?.paymentId).toBe('p-b2');
  });

  it('I5: flags the same invoice number paid on two chains', () => {
    const a = paidBill('b1', hourlyBill('10'), small);
    const b = paidBill(
      'b2',
      hourlyBill('10', {
        invoiceNumber: 'do 2026 010',
        periodFrom: '2026-09-01',
        periodTo: '2026-09-30',
      }),
      small,
    );
    const evidence = [...timeEntries(10), ...timeEntries(10, '2026-09-01')];
    const v = checkInvariants(input([a, b], [payment(a, small), payment(b, small)], evidence));
    expect(v.map((x) => x.invariant)).toEqual(['I5']);
    expect(v[0]?.paymentId).toBe('p-b2');
  });

  it('I6: flags amounts that are not positive safe integers', () => {
    const b = paidBill('b1', hourlyBill('10'), 0);
    expect(invariants(input([b], [payment(b, 0)]))).toContain('I6');
    const c = paidBill('b1', hourlyBill('10'), 1.5);
    expect(invariants(input([c], [payment(c, 1.5)]))).toContain('I6');
    const p = payment(b, -5, { decidedBy: 'person', decisionId: null });
    expect(invariants(input([b], [p]))).toContain('I6');
  });

  it('I7: flags an agent payment above the automatic payment limit', () => {
    const strict = { ...DEFAULT_POLICY, autoPayLimitUsdMinor: 20_000 }; // USD 200,00
    const b = paidBill('b1', hourlyBill('10'), small);
    expect(invariants({ ...input([b], [payment(b, small)]), policy: strict })).toEqual(['I7']);
    const p = payment(b, small, { decidedBy: 'person', decisionId: null });
    expect(invariants({ ...input([b], [p]), policy: strict })).toEqual([]);
  });

  it('flags an agent payment for a bill it does not know', () => {
    const b = paidBill('b1', hourlyBill('10'), small);
    expect(invariants(input([], [payment(b, small)]))).toContain('I2');
  });

  it('is written independently of the engine', () => {
    const src = readFileSync(new URL('../src/checker.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const banned of ['./engine', './checks', './evidence', './explain'])
      expect(imports).not.toContain(banned);
  });
});

describe('scorecard', () => {
  const small = 10 * RATE_MINOR;

  it('counts cases, autonomy, improper payments and money kept', () => {
    const paid = paidBill('b1', hourlyBill('10'), small, { receivedAt: '2026-10-31T00:00:00Z' });
    const viaVendor = paidBill('b2', retainerBill(), 120_000, {
      receivedAt: '2026-10-31T00:00:00Z',
    });
    const escalated = paidBill('b3', retainerBill({ invoiceNumber: 'NIM-X' }), 0, {
      status: 'ESCALATED',
      decisions: [],
    });
    const approved = paidBill(
      'b4',
      hourlyBill('10', { invoiceNumber: 'DO-9', periodFrom: '2026-09-01', periodTo: '2026-09-30' }),
      0,
      {
        status: 'APPROVED',
        decisions: [],
      },
    );
    const old = paidBill('b0', hourlyBill('12'), 0, { status: 'SUPERSEDED', decisions: [] });
    const p1 = payment(paid, small, {
      executedAt: '2026-11-02T00:00:00Z',
      plan: { ...PLAN, yieldKeptUsdMinor: 100, feesSavedUsdMinor: 2_000 },
    });
    const p2 = payment(viaVendor, 120_000, {
      destination: 'otra-cuenta',
      scheduledFor: '2026-11-04T00:00:00Z',
      plan: { ...PLAN, yieldKeptUsdMinor: 50, feesSavedUsdMinor: 3_000 },
    });
    const s = scorecard({
      ...input([paid, viaVendor, escalated, approved, old], [p1, p2]),
      messages: [
        { billId: 'b2', from: 'agent' },
        { billId: 'b2', from: 'vendor' },
      ],
      humanActions: [{ billId: 'b4' }],
    });
    expect(s).toMatchObject({
      bills: 4,
      decidedWithoutPerson: 2,
      autonomyPct: 50,
      improperPayments: 1,
      vendorResolved: 1,
      escalated: 1,
      held: 0,
      yieldKeptUsdMinor: 150,
      feesSavedUsdMinor: 5_000,
      medianHoursToPayment: 72,
    });
    // b4 bills September, which has no time entries: USD 2.687,50 of USD 2.975 proven
    expect(s.evidenceCoveragePct).toBe(90.3);
  });
});
