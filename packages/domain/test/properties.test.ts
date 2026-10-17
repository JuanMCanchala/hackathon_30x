import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkInvariants, type CheckerBill } from '../src/checker';
import { addDays } from '../src/dates';
import { decide, statusForOutcome } from '../src/engine';
import { minorToDecimal } from '../src/money';
import type { Payment } from '../src/payments';
import { normalizeInvoiceNumber } from '../src/text';
import {
  DEFAULT_POLICY,
  type Contract,
  type Decision,
  type DecisionContext,
  type EvidenceItem,
  type ExtractedBill,
  type ExtractedLine,
  type Policy,
  type Vendor,
} from '../src/types';
import { bill, context, CONTRACTS, FX, item, VENDORS } from './fixtures';

const RUNS = { numRuns: 300, seed: 42 };

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const confidence = fc.oneof(
  { weight: 15, arbitrary: fc.constant(1) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
);

const randomDigits = fc.stringMatching(/^[0-9]{6,20}$/);

/** Free text that sometimes carries a payout destination: the registered one, or another. */
const payoutText = (vendor: Vendor) =>
  fc.oneof(
    { weight: 12, arbitrary: fc.constant(null) },
    { weight: 4, arbitrary: fc.constant(`Pagar a ${vendor.payout.destination}`) },
    { weight: 1, arbitrary: randomDigits.map((d) => `Cuenta de ahorros Banco ${d}`) },
    { weight: 1, arbitrary: randomDigits.map((d) => `Ref ${d} gracias`) },
    { weight: 1, arbitrary: fc.constant('Tenemos nueva cuenta en otro banco.') },
    { weight: 1, arbitrary: fc.string({ maxLength: 60 }) },
  );

const PERIODS: [string | null, string | null][] = [
  ['2026-10-01', '2026-10-31'],
  ['2026-10-01', '2026-10-15'],
  ['2026-09-01', '2026-09-30'],
  ['2026-10-31', '2026-10-01'],
  ['2026-02-01', '2026-02-30'],
  [null, null],
];

/** A two-decimal amount near `minor` (exact, a little off, or anything). */
const amountNear = (minor: number) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant(minor) },
    {
      weight: 1,
      arbitrary: fc.integer({ min: -100, max: 100 }).map((d) => Math.max(0, minor + d)),
    },
    { weight: 1, arbitrary: fc.integer({ min: 0, max: 3 * minor + 100 }) },
  );

const hundredths = (h: number) => `${Math.floor(h / 100)}.${String(h % 100).padStart(2, '0')}`;

/** The main bill line for the contract's first term. */
function mainLine(contract: Contract): fc.Arbitrary<ExtractedLine> {
  const term = contract.terms[0]!;
  const cur = contract.currency;
  if (term.kind === 'hours') {
    return fc
      .record({
        h: fc.integer({ min: 0, max: 25_000 }), // up to 250 h, in hundredths
        rate: fc.oneof(
          { weight: 3, arbitrary: fc.constant(term.unitPriceMinor) },
          { weight: 1, arbitrary: fc.integer({ min: 1, max: 2 * term.unitPriceMinor }) },
        ),
        exact: fc.oneof(
          { weight: 6, arbitrary: fc.constant(true) },
          { weight: 1, arbitrary: fc.constant(false) },
        ),
        noise: fc.integer({ min: -500, max: 500 }),
      })
      .map(({ h, rate, exact, noise }) => {
        const amount = Math.round((h * rate) / 100) + (exact ? 0 : noise);
        return {
          description: term.title,
          quantity: hundredths(h),
          unit: 'hour',
          unitPrice: minorToDecimal(rate, cur),
          amount: minorToDecimal(Math.max(0, amount), cur),
        };
      });
  }
  return amountNear(term.unitPriceMinor).map((a) => ({
    description: term.title,
    quantity: '1',
    unit: term.kind === 'retainer' ? 'month' : 'milestone',
    unitPrice: minorToDecimal(a, cur),
    amount: minorToDecimal(a, cur),
  }));
}

const extraLine: fc.Arbitrary<ExtractedLine> = fc.record({
  description: fc.oneof(fc.constant('Gastos de viaje'), fc.string({ maxLength: 30 })),
  quantity: fc.constant('1'),
  unit: fc.constant('other' as const),
  unitPrice: fc.integer({ min: 0, max: 500_000 }).map((m) => minorToDecimal(m, 'COP')),
  amount: fc.integer({ min: 0, max: 500_000 }).map((m) => minorToDecimal(m, 'COP')),
});

interface Scenario {
  vendor: Vendor;
  contract: Contract;
  reading: ExtractedBill;
  matchConfidences: number[];
  termChoice: ('right' | 'none' | 'other')[];
}

const scenario: fc.Arbitrary<Scenario> = fc.constantFrom(...CONTRACTS).chain((contract) => {
  const vendor = VENDORS.find((v) => v.id === contract.vendorId)!;
  const others = VENDORS.filter((v) => v.id !== vendor.id);
  return fc
    .record({
      lines: fc.tuple(
        mainLine(contract),
        fc.oneof({ weight: 5, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: extraLine }),
      ),
      sumTotal: fc.oneof(
        { weight: 10, arbitrary: fc.constant(true) },
        { weight: 1, arbitrary: fc.constant(false) },
      ),
      otherTotal: fc.integer({ min: 0, max: 10 * contract.terms[0]!.unitPriceMinor }),
      taxId: fc.oneof(
        { weight: 20, arbitrary: fc.constant<string | null>(vendor.taxId) },
        { weight: 1, arbitrary: fc.constantFrom<string | null>(...others.map((v) => v.taxId)) },
        { weight: 1, arbitrary: fc.oneof(fc.constant(null), fc.string({ maxLength: 12 })) },
      ),
      currency: fc.oneof(
        { weight: 20, arbitrary: fc.constant<string | null>(contract.currency) },
        { weight: 1, arbitrary: fc.constantFrom<string | null>('USD', 'COP', 'MXN', null) },
      ),
      issueDate: fc.oneof(
        { weight: 15, arbitrary: fc.constant<string | null>('2026-10-31') },
        {
          weight: 1,
          arbitrary: fc.constantFrom<string | null>('2025-12-31', '2026-02-30', 'ayer', null),
        },
      ),
      period: fc.oneof(
        { weight: 8, arbitrary: fc.constant(PERIODS[0]!) },
        { weight: 2, arbitrary: fc.constantFrom(...PERIODS) },
      ),
      invoiceNumber: fc.oneof(
        { weight: 6, arbitrary: fc.constant<string | null>('INV-2026-10') },
        { weight: 1, arbitrary: fc.constantFrom<string | null>('inv 2026 010', null, '') },
      ),
      payoutDetails: payoutText(vendor),
      instructions: fc.oneof(
        { weight: 20, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
      conf: fc.tuple(confidence, confidence, confidence, confidence, confidence, confidence),
      matchConfidences: fc.tuple(confidence, confidence),
      termChoice: fc.tuple(
        fc.oneof(
          { weight: 12, arbitrary: fc.constant<'right' | 'none' | 'other'>('right') },
          { weight: 1, arbitrary: fc.constantFrom<'right' | 'none' | 'other'>('none', 'other') },
        ),
        fc.constantFrom<'right' | 'none' | 'other'>('right', 'none', 'other'),
      ),
    })
    .map((r): Scenario => {
      const lines = r.lines[1] ? [r.lines[0], r.lines[1]] : [r.lines[0]];
      const sum = lines.reduce((s, l) => s + Number(l.amount!.replace('.', '')), 0);
      const [vendorC, invoiceC, totalC, linesC, currencyC, datesC] = r.conf;
      const reading = bill({
        vendorName: vendor.name,
        vendorTaxId: r.taxId,
        invoiceNumber: r.invoiceNumber,
        issueDate: r.issueDate,
        periodFrom: r.period[0],
        periodTo: r.period[1],
        currency: r.currency,
        total: minorToDecimal(r.sumTotal ? sum : r.otherTotal, contract.currency),
        lines,
        payoutDetails: r.payoutDetails,
        instructionsToAgent: r.instructions,
        confidence: {
          vendor: vendorC,
          invoiceNumber: invoiceC,
          total: totalC,
          lines: linesC,
          currency: currencyC,
          dates: datesC,
        },
      });
      return {
        vendor,
        contract,
        reading,
        matchConfidences: r.matchConfidences,
        termChoice: r.termChoice,
      };
    });
});

const EVIDENCE_REFS: [EvidenceItem['kind'], string][] = [
  ['time_entry', 'altamar-pagos'],
  ['time_entry', 'otro-proyecto'],
  ['deliverable_accepted', 'brand-kit-v2'],
  ['deliverable_pending', 'brand-kit-v2'],
  ['pr_merged', 'altamar-labs/pagos#42'],
  ['pr_open', 'altamar-labs/pagos#42'],
  ['pr_merged', 'altamar-labs/pagos#43'],
];

const evidenceSet: fc.Arbitrary<EvidenceItem[]> = fc.array(
  fc
    .record({
      id: fc.integer({ min: 0, max: 40 }), // repeated ids are possible on purpose
      ref: fc.constantFrom(...EVIDENCE_REFS),
      vendorId: fc.constantFrom(...VENDORS.map((v) => v.id), 'v-otro'),
      day: fc.integer({ min: 0, max: 75 }), // 2026-09-15 .. 2026-11-28
      minutes: fc.integer({ min: 0, max: 600 }),
    })
    .map(({ id, ref, vendorId, day, minutes }) =>
      item({
        id: `e${id}`,
        vendorId,
        kind: ref[0],
        ref: ref[1],
        occurredAt: `${addDays('2026-09-15', day)}T10:00:00-05:00`,
        minutes: ref[0] === 'time_entry' ? minutes : undefined,
      }),
    ),
  { maxLength: 40 },
);

/** Proof aimed at the scenario's own bill (none, part or all of it), plus random noise. */
function evidenceFor(s: Scenario, prefix: string): fc.Arbitrary<EvidenceItem[]> {
  const term = s.contract.terms[0]!;
  const req = term.evidence;
  let aimed: fc.Arbitrary<EvidenceItem[]> = fc.constant([]);
  if (req?.type === 'time_entries') {
    const billedMinutes = Math.round(Number(s.reading.lines[0]!.quantity ?? '0') * 60);
    aimed = fc.integer({ min: 0, max: 120 }).map((pct) => {
      const out: EvidenceItem[] = [];
      let left = Math.floor((billedMinutes * pct) / 100);
      for (let day = 0; left > 0; day++, left -= 480)
        out.push(
          item({
            id: `${prefix}t${day}`,
            vendorId: s.vendor.id,
            ref: req.project,
            minutes: Math.min(480, left),
            occurredAt: `${addDays('2026-10-01', day)}T09:00:00-05:00`,
          }),
        );
      return out;
    });
  } else if (req?.type === 'deliverable' || req?.type === 'github_pr') {
    const [kind, ref] =
      req.type === 'deliverable'
        ? (['deliverable_accepted', req.deliverableId] as const)
        : (['pr_merged', `${req.repo}#${req.number}`] as const);
    aimed = fc
      .boolean()
      .map((ok) => (ok ? [item({ id: `${prefix}m`, vendorId: s.vendor.id, kind, ref })] : []));
  }
  return fc
    .tuple(aimed, evidenceSet)
    .map(([a, noise]) => [...a, ...noise.map((e) => ({ ...e, id: `${prefix}${e.id}` }))]);
}

const withEvidence = scenario.chain((s) => fc.tuple(fc.constant(s), evidenceFor(s, 'a')));
const withSecond = scenario.chain((s) => fc.tuple(fc.constant(s), evidenceFor(s, 'b')));

const policy: fc.Arbitrary<Policy> = fc.record({
  minReadingConfidence: fc.oneof(
    fc.constant(DEFAULT_POLICY.minReadingConfidence),
    fc.double({ min: 0, max: 1, noNaN: true }),
  ),
  minMatchConfidence: fc.oneof(
    fc.constant(DEFAULT_POLICY.minMatchConfidence),
    fc.double({ min: 0, max: 1, noNaN: true }),
  ),
  autoPayLimitUsdMinor: fc.oneof(
    fc.constant(DEFAULT_POLICY.autoPayLimitUsdMinor),
    fc.integer({ min: 0, max: 5_000_000 }),
  ),
});

function contextFor(
  s: Scenario,
  evidence: EvidenceItem[],
  p: Policy,
  extra: Partial<Parameters<typeof context>[1]> = {},
): DecisionContext {
  const termIds = s.reading.lines.map((_, i) => {
    const choice = s.termChoice[i]!;
    if (choice === 'right') return s.contract.terms[0]!.id;
    return choice === 'other' ? 'termino-ajeno' : null;
  });
  const ctx = context(s.reading, { evidence, policy: p, termIds, ...extra });
  ctx.matches = ctx.matches!.map((m) => ({ ...m, confidence: s.matchConfidences[m.lineIndex]! }));
  return ctx;
}

// ---------------------------------------------------------------------------
// Turning a decision into what the checker sees
// ---------------------------------------------------------------------------

function checkerBill(ctx: DecisionContext, d: Decision, status = statusForOutcome(d.outcome)) {
  return {
    id: ctx.bill.id,
    vendorId: d.vendorId,
    contractId: d.contractId,
    reading: ctx.bill.reading,
    status,
    chain: ctx.bill.chain,
    matches: ctx.matches,
    decisions: [{ id: `d-${ctx.bill.id}`, outcome: d.outcome, payNowMinor: d.payNowMinor }],
  } satisfies CheckerBill;
}

/** The payment the API would create for a paying decision; null when nothing is paid. */
function paymentFor(ctx: DecisionContext, d: Decision): Payment | null {
  if ((d.outcome !== 'PAY' && d.outcome !== 'PAY_PART') || d.payNowMinor === 0) return null;
  const vendor = VENDORS.find((v) => v.id === d.vendorId)!;
  return {
    id: `p-${ctx.bill.id}`,
    billId: ctx.bill.id,
    vendorId: vendor.id,
    contractId: d.contractId,
    amountMinor: d.payNowMinor,
    currency: d.currency!,
    destination: vendor.payout.destination,
    rail: vendor.payout.rail,
    decidedBy: 'agent',
    decisionId: `d-${ctx.bill.id}`,
    scheduledFor: '2026-11-15',
    executedAt: null,
    status: 'scheduled',
    plan: {
      rail: vendor.payout.rail,
      payOn: '2026-11-15',
      reason: '',
      amountMinor: d.payNowMinor,
      discountMinor: 0,
      usdDebitMinor: 0,
      feeUsdMinor: 0,
      wireCostUsdMinor: 0,
      feesSavedUsdMinor: 0,
      yieldKeptUsdMinor: 0,
    },
    reference: `RCB-${ctx.bill.id}`,
  };
}

const checkerInput = (
  bills: CheckerBill[],
  payments: Payment[],
  evidence: EvidenceItem[],
  p: Policy,
) => ({ vendors: VENDORS, contracts: CONTRACTS, evidence, payments, bills, fx: FX, policy: p });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('properties: the engine never makes an improper payment', () => {
  it('every paying decision passes the independent checker', () => {
    let paid = 0;
    fc.assert(
      fc.property(withEvidence, policy, ([s, evidence], p) => {
        const ctx = contextFor(s, evidence, p);
        const d = decide(ctx);
        expect(d.payNowMinor).toBeGreaterThanOrEqual(0);
        const payment = paymentFor(ctx, d);
        if (!payment) return;
        paid++;
        const violations = checkInvariants(
          checkerInput([checkerBill(ctx, d)], [payment], evidence, p),
        );
        expect(violations).toEqual([]);
      }),
      RUNS,
    );
    // the generator must actually reach paying decisions, or the property proves nothing
    expect(paid).toBeGreaterThan(30);
  });

  it('a corrected bill never pays the already-paid part twice', () => {
    let both = 0;
    fc.assert(
      fc.property(withEvidence, withSecond, ([first, own], [second, more]) => {
        const evidence = [...own, ...more];
        const p = DEFAULT_POLICY;
        const ctx1 = contextFor(first, evidence, p, { billId: 'b1' });
        const d1 = decide(ctx1);
        const p1 = paymentFor(ctx1, d1);
        const paidMinor = p1?.amountMinor ?? 0;

        const revision = {
          ...second,
          reading: { ...second.reading, revisionOf: first.reading.invoiceNumber },
        };
        const ctx2 = contextFor(revision, evidence, p, {
          billId: 'b2',
          chain: ['b2', 'b1'],
          case: { paidMinor, askedAt: '2026-10-31T18:00:00Z' },
          history: [
            {
              billId: 'b1',
              vendorId: d1.vendorId ?? 'desconocido',
              contractId: d1.contractId,
              invoiceNumberNormalized: first.reading.invoiceNumber
                ? normalizeInvoiceNumber(first.reading.invoiceNumber)
                : null,
              status: statusForOutcome(d1.outcome),
              paidMinor,
              currency: d1.currency,
              periodFrom: first.reading.periodFrom,
              periodTo: first.reading.periodTo,
              termIds: d1.lines.flatMap((l) => (l.termId ? [l.termId] : [])),
              chain: ['b1'],
            },
          ],
        });
        const d2 = decide(ctx2);
        const p2 = paymentFor(ctx2, d2);
        if (p1 && p2) both++;
        const payments = [p1, p2].filter((x): x is Payment => x !== null);
        const violations = checkInvariants(
          checkerInput(
            [checkerBill(ctx1, d1, 'SUPERSEDED'), checkerBill(ctx2, d2)],
            payments,
            evidence,
            p,
          ),
        );
        expect(violations).toEqual([]);
      }),
      RUNS,
    );
    expect(both).toBeGreaterThan(0);
  });

  it('tightening minReadingConfidence or autoPayLimit never turns a non-PAY into PAY', () => {
    fc.assert(
      fc.property(
        withEvidence,
        policy,
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 5_000_000 }),
        ([s, evidence], loose, raise, cut) => {
          const strict: Policy = {
            ...loose,
            minReadingConfidence: Math.min(1, loose.minReadingConfidence + raise),
            autoPayLimitUsdMinor: Math.max(0, loose.autoPayLimitUsdMinor - cut),
          };
          const before = decide(contextFor(s, evidence, loose));
          const after = decide(contextFor(s, evidence, strict));
          if (before.outcome !== 'PAY') expect(after.outcome).not.toBe('PAY');
          expect(after.payNowMinor).toBeLessThanOrEqual(before.payNowMinor);
        },
      ),
      RUNS,
    );
  });
});
