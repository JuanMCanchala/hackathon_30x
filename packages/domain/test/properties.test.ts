import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkInvariants, type CheckerBill, type CheckerInput } from '../src/checker';
import { addDays } from '../src/dates';
import { decide, statusForOutcome } from '../src/engine';
import { minorToDecimal } from '../src/money';
import type { Payment } from '../src/payments';
import { normalizeInvoiceNumber } from '../src/text';
import {
  DEFAULT_POLICY,
  type BillStatus,
  type Contract,
  type ContractTerm,
  type Decision,
  type DecisionContext,
  type EvidenceItem,
  type ExtractedBill,
  type ExtractedLine,
  type HistoryBill,
  type Policy,
  type Vendor,
} from '../src/types';
import { bill, context, CONTRACTS, FX, item, VENDORS } from './fixtures';

const RUNS = { numRuns: 300, seed: 42 };

// ---------------------------------------------------------------------------
// Two more contract kinds, only for the properties: usage (metered) and goods (delivery).
// ---------------------------------------------------------------------------

const fluxo: Vendor = {
  id: 'v-fluxo',
  name: 'Fluxo Dados',
  legalName: 'Fluxo Dados Ltda.',
  country: 'BR',
  taxId: '12.345.678/0001-90',
  email: 'financeiro@fluxo.com.br',
  contactName: 'Equipe financeira',
  payout: {
    rail: 'pix',
    currency: 'BRL',
    destination: 'financeiro@fluxo.com.br',
    display: 'Pix financeiro@…',
  },
};

const norte: Vendor = {
  id: 'v-norte',
  name: 'Suministros Norteños',
  legalName: 'Suministros Norteños S.A. de C.V.',
  country: 'MX',
  taxId: 'SNO850101XY2',
  email: 'cobranza@nortenos.mx',
  contactName: 'Área de cobranza',
  payout: {
    rail: 'spei',
    currency: 'MXN',
    destination: '646180157000000004',
    display: 'CLABE ••• 0004',
  },
};

const usageTerm: ContractTerm = {
  id: 'fluxo-consultas',
  kind: 'usage',
  title: 'Consultas de API',
  unitPriceMinor: 5, // BRL 0,05 per query
  evidence: { type: 'usage_report', meter: 'api-consultas' },
};

const goodsTerm: ContractTerm = {
  id: 'norte-equipos',
  kind: 'goods',
  title: 'Lote de equipos',
  unitPriceMinor: 3_000_000, // MXN 30.000,00
  evidence: { type: 'delivery', orderId: 'OC-2026-118' },
};

const contractBase = {
  validFrom: '2026-01-01',
  validTo: null,
  netDays: 15,
  earlyPayment: null,
  vendorResponseDays: 5,
};

const usageContract: Contract = {
  ...contractBase,
  id: 'c-fluxo',
  vendorId: fluxo.id,
  type: 'usage',
  title: 'API de datos — Fluxo',
  currency: 'BRL',
  terms: [usageTerm],
  periodCapMinor: 2_000_000,
  allowPartial: true,
  evidenceRuleText: 'Consultas registradas por el medidor en el período.',
};

const goodsContract: Contract = {
  ...contractBase,
  id: 'c-norte',
  vendorId: norte.id,
  type: 'goods',
  title: 'Equipos — Suministros Norteños',
  currency: 'MXN',
  terms: [goodsTerm],
  periodCapMinor: 10_000_000,
  allowPartial: false,
  evidenceRuleText: 'Entrega confirmada de la orden de compra.',
};

const ALL_VENDORS = [...VENDORS, fluxo, norte];
const ALL_CONTRACTS = [...CONTRACTS, usageContract, goodsContract];

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const confidence = fc.oneof(
  { weight: 15, arbitrary: fc.constant(1) },
  { weight: 1, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
);

const randomDigits = fc.stringMatching(/^[0-9]{6,20}$/);

/** Payout text that is not fraud: nothing, the registered destination, or noise. */
const benignPayout = (vendor: Vendor) =>
  fc.oneof(
    { weight: 12, arbitrary: fc.constant<string | null>(null) },
    { weight: 4, arbitrary: fc.constant(`Pagar a ${vendor.payout.destination}`) },
    { weight: 1, arbitrary: randomDigits.map((d) => `Ref ${d} gracias`) },
    { weight: 1, arbitrary: fc.string({ maxLength: 60 }) },
  );

const CHANGE_PHRASES = [
  'Tenemos nueva cuenta bancaria desde este mes.',
  'Hubo un cambio de cuenta, por favor tenerlo en cuenta.',
  'Actualicen los datos bancarios antes de pagar.',
  'Mudamos de banco.',
  'Please note our new bank account.',
];

type Where = 'payoutDetails' | 'line' | 'documentText';

/** A foreign destination or a payout-change phrase, and where it is planted. */
const fraud = fc.oneof(
  { weight: 3, arbitrary: fc.constant(null) },
  {
    weight: 1,
    arbitrary: fc.record({
      text: fc.oneof(
        fc
          .stringMatching(/^[1-9][0-9]{9,15}$/)
          .map((d) => `Consignar a la cuenta de ahorros Banco del Pacífico ${d}`),
        fc.constantFrom(...CHANGE_PHRASES),
      ),
      where: fc.constantFrom<Where>('payoutDetails', 'line', 'documentText'),
    }),
  },
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

/** A metered or hourly line: quantity × rate, sometimes off. */
function quantityLine(
  term: ContractTerm,
  cur: Contract['currency'],
  maxHundredths: number,
  unit: ExtractedLine['unit'],
): fc.Arbitrary<ExtractedLine> {
  return fc
    .record({
      q: fc.integer({ min: 0, max: maxHundredths }),
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
    .map(({ q, rate, exact, noise }) => {
      const amount = Math.round((q * rate) / 100) + (exact ? 0 : noise);
      return {
        description: term.title,
        quantity: hundredths(q),
        unit,
        unitPrice: minorToDecimal(rate, cur),
        amount: minorToDecimal(Math.max(0, amount), cur),
      };
    });
}

/** The main bill line for the contract's first term. */
function mainLine(contract: Contract): fc.Arbitrary<ExtractedLine> {
  const term = contract.terms[0]!;
  const cur = contract.currency;
  if (term.kind === 'hours') return quantityLine(term, cur, 25_000, 'hour'); // up to 250 h
  if (term.kind === 'usage') return quantityLine(term, cur, 40_000_000, 'unit'); // 400.000 q
  return amountNear(term.unitPriceMinor).map((a) => ({
    description: term.title,
    quantity: '1',
    unit: term.kind === 'retainer' ? 'month' : term.kind === 'goods' ? 'unit' : 'milestone',
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

type TermChoice = 'right' | 'none' | 'other';

interface Scenario {
  vendor: Vendor;
  contract: Contract;
  /** the bill as written, before any fraud is planted */
  reading: ExtractedBill;
  documentText: string | null;
  fraud: { text: string; where: Where } | null;
  matchConfidences: number[];
  termChoice: TermChoice[];
}

function scenarioFor(contract: Contract): fc.Arbitrary<Scenario> {
  const vendor = ALL_VENDORS.find((v) => v.id === contract.vendorId)!;
  const others = ALL_VENDORS.filter((v) => v.id !== vendor.id);
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
        { weight: 1, arbitrary: fc.constantFrom<string | null>('USD', 'COP', 'MXN', 'BRL', null) },
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
      payoutDetails: benignPayout(vendor),
      documentText: fc.constantFrom<string | null>(
        null,
        null,
        'Adjunto la cuenta de cobro del mes.',
      ),
      fraud,
      instructions: fc.oneof(
        { weight: 20, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
      conf: fc.tuple(confidence, confidence, confidence, confidence, confidence, confidence),
      matchConfidences: fc.tuple(confidence, confidence),
      termChoice: fc.tuple(
        fc.oneof(
          { weight: 12, arbitrary: fc.constant<TermChoice>('right') },
          { weight: 1, arbitrary: fc.constantFrom<TermChoice>('none', 'other') },
        ),
        fc.constantFrom<TermChoice>('right', 'none', 'other'),
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
        documentText: r.documentText,
        fraud: r.fraud,
        matchConfidences: r.matchConfidences,
        termChoice: r.termChoice,
      };
    });
}

const scenario = fc.constantFrom(...ALL_CONTRACTS).chain(scenarioFor);
/** Without planted fraud: the multi-bill properties are about amounts, not payout text. */
const honest = (c: Contract) => scenarioFor(c).map((x): Scenario => ({ ...x, fraud: null }));
const honestScenario = fc.constantFrom(...ALL_CONTRACTS).chain(honest);

const EVIDENCE_REFS: [EvidenceItem['kind'], string][] = [
  ['time_entry', 'altamar-pagos'],
  ['time_entry', 'otro-proyecto'],
  ['deliverable_accepted', 'brand-kit-v2'],
  ['deliverable_pending', 'brand-kit-v2'],
  ['pr_merged', 'altamar-labs/pagos#42'],
  ['pr_open', 'altamar-labs/pagos#42'],
  ['pr_merged', 'altamar-labs/pagos#43'],
  ['usage_report', 'api-consultas'],
  ['delivery_confirmed', 'OC-2026-118'],
];

const evidenceSet: fc.Arbitrary<EvidenceItem[]> = fc.array(
  fc
    .record({
      id: fc.integer({ min: 0, max: 40 }), // repeated ids are possible on purpose
      ref: fc.constantFrom(...EVIDENCE_REFS),
      vendorId: fc.constantFrom(...ALL_VENDORS.map((v) => v.id), 'v-otro'),
      day: fc.integer({ min: 0, max: 75 }), // 2026-09-15 .. 2026-11-28
      // fractional and negative minutes come from sloppy sources: they must never count
      minutes: fc.oneof(
        { weight: 8, arbitrary: fc.integer({ min: 0, max: 600 }) },
        { weight: 1, arbitrary: fc.double({ min: -60, max: 600, noNaN: true }) },
      ),
      quantity: fc.integer({ min: 0, max: 100_000 }).map(String),
    })
    .map(({ id, ref, vendorId, day, minutes, quantity }) =>
      item({
        id: `e${id}`,
        vendorId,
        kind: ref[0],
        ref: ref[1],
        occurredAt: `${addDays('2026-09-15', day)}T10:00:00-05:00`,
        minutes: ref[0] === 'time_entry' ? minutes : undefined,
        quantity: ref[0] === 'usage_report' ? quantity : undefined,
      }),
    ),
  { maxLength: 40 },
);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Proof aimed at the scenario's own bill (none, part or all of it), plus random noise. */
function evidenceFor(s: Scenario, prefix: string): fc.Arbitrary<EvidenceItem[]> {
  const req = s.contract.terms[0]!.evidence;
  const from = DAY.test(s.reading.periodFrom ?? '') ? s.reading.periodFrom! : '2026-10-01';
  const billed = Number(s.reading.lines[0]!.quantity ?? '0');
  let aimed: fc.Arbitrary<EvidenceItem[]> = fc.constant([]);
  if (req?.type === 'time_entries') {
    aimed = fc.integer({ min: 0, max: 120 }).map((pct) => {
      const out: EvidenceItem[] = [];
      let left = Math.floor((Math.round(billed * 60) * pct) / 100);
      for (let day = 0; left > 0; day++, left -= 480)
        out.push(
          item({
            id: `${prefix}t${day}`,
            vendorId: s.vendor.id,
            ref: req.project,
            minutes: Math.min(480, left),
            occurredAt: `${addDays(from, day)}T09:00:00-05:00`,
          }),
        );
      return out;
    });
  } else if (req?.type === 'usage_report') {
    aimed = fc.integer({ min: 0, max: 120 }).map((pct) => {
      const total = Math.floor((billed * pct) / 100);
      const half = Math.floor(total / 2);
      return [half, total - half].map((q, i) =>
        item({
          id: `${prefix}u${i}`,
          vendorId: s.vendor.id,
          source: 'medidor',
          kind: 'usage_report',
          ref: req.meter,
          quantity: String(q),
          occurredAt: `${addDays(from, i * 7)}T23:00:00Z`,
        }),
      );
    });
  } else if (req && req.type !== 'ticket') {
    const [kind, ref] =
      req.type === 'deliverable'
        ? (['deliverable_accepted', req.deliverableId] as const)
        : req.type === 'github_pr'
          ? (['pr_merged', `${req.repo}#${req.number}`] as const)
          : (['delivery_confirmed', req.orderId] as const);
    aimed = fc
      .boolean()
      .map((ok) => (ok ? [item({ id: `${prefix}m`, vendorId: s.vendor.id, kind, ref })] : []));
  }
  return fc
    .tuple(aimed, evidenceSet)
    .map(([a, noise]) => [...a, ...noise.map((e) => ({ ...e, id: `${prefix}${e.id}` }))]);
}

const withEvidence = (s: fc.Arbitrary<Scenario>, prefix: string) =>
  s.chain((x) => fc.tuple(fc.constant(x), evidenceFor(x, prefix)));

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

/** The reading and e-mail text with the scenario's fraud planted (or untouched). */
function planted(s: Scenario, withFraud: boolean) {
  const f = withFraud ? s.fraud : null;
  const join = (a: string | null, b: string) => (a ? `${a} ${b}` : b);
  const reading: ExtractedBill = {
    ...s.reading,
    payoutDetails:
      f?.where === 'payoutDetails'
        ? join(s.reading.payoutDetails, f.text)
        : s.reading.payoutDetails,
    lines: s.reading.lines.map((l, i) =>
      f?.where === 'line' && i === 0 ? { ...l, description: `${l.description} — ${f.text}` } : l,
    ),
  };
  const documentText = f?.where === 'documentText' ? join(s.documentText, f.text) : s.documentText;
  return { reading, documentText };
}

function contextFor(
  s: Scenario,
  evidence: EvidenceItem[],
  p: Policy,
  extra: Partial<Parameters<typeof context>[1]> = {},
  withFraud = true,
): DecisionContext {
  const termIds = s.reading.lines.map((_, i) => {
    const choice = s.termChoice[i]!;
    if (choice === 'right') return s.contract.terms[0]!.id;
    return choice === 'other' ? 'termino-ajeno' : null;
  });
  const { reading, documentText } = planted(s, withFraud);
  const ctx = context(reading, {
    evidence,
    policy: p,
    termIds,
    documentText,
    vendors: ALL_VENDORS,
    contracts: ALL_CONTRACTS,
    ...extra,
  });
  ctx.matches = ctx.matches!.map((m) => ({ ...m, confidence: s.matchConfidences[m.lineIndex]! }));
  return ctx;
}

// ---------------------------------------------------------------------------
// Turning a decision into what the checker sees
// ---------------------------------------------------------------------------

function checkerBill(
  ctx: DecisionContext,
  d: Decision,
  status: BillStatus = statusForOutcome(d.outcome),
): CheckerBill {
  return {
    id: ctx.bill.id,
    vendorId: d.vendorId,
    contractId: d.contractId,
    reading: ctx.bill.reading,
    status,
    chain: ctx.bill.chain,
    matches: ctx.matches,
    decisions: [{ id: `d-${ctx.bill.id}`, outcome: d.outcome, payNowMinor: d.payNowMinor }],
  };
}

function makePayment(
  ctx: DecisionContext,
  d: Decision,
  amountMinor: number,
  decidedBy: Payment['decidedBy'],
): Payment {
  const vendor = ALL_VENDORS.find((v) => v.id === d.vendorId)!;
  return {
    id: `p-${ctx.bill.id}`,
    billId: ctx.bill.id,
    vendorId: vendor.id,
    contractId: d.contractId,
    amountMinor,
    currency: d.currency!,
    destination: vendor.payout.destination,
    rail: vendor.payout.rail,
    decidedBy,
    decisionId: decidedBy === 'agent' ? `d-${ctx.bill.id}` : null,
    scheduledFor: '2026-11-15',
    executedAt: null,
    status: 'scheduled',
    plan: {
      rail: vendor.payout.rail,
      payOn: '2026-11-15',
      reason: '',
      amountMinor,
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

/** The payment the API would create for a paying decision; null when nothing is paid. */
function paymentFor(ctx: DecisionContext, d: Decision): Payment | null {
  if ((d.outcome !== 'PAY' && d.outcome !== 'PAY_PART') || d.payNowMinor === 0) return null;
  return makePayment(ctx, d, d.payNowMinor, 'agent');
}

/** A person approves and pays the whole bill, whatever the agent said (when it can be placed). */
function personPaymentFor(ctx: DecisionContext, d: Decision): Payment | null {
  if (!d.vendorId || !d.contractId || d.billedMinor <= 0) return null;
  return makePayment(ctx, d, d.billedMinor, 'person');
}

/** What the next bill's engine context knows about a previous bill. */
function historyOf(ctx: DecisionContext, d: Decision, paid: Payment | null): HistoryBill {
  const reading = ctx.bill.reading!;
  const contract = ALL_CONTRACTS.find((c) => c.id === d.contractId);
  return {
    billId: ctx.bill.id,
    vendorId: d.vendorId ?? 'desconocido',
    contractId: d.contractId,
    invoiceNumberNormalized: reading.invoiceNumber?.trim()
      ? normalizeInvoiceNumber(reading.invoiceNumber)
      : null,
    status: paid?.decidedBy === 'person' ? 'APPROVED' : statusForOutcome(d.outcome),
    paidMinor: paid?.amountMinor ?? 0,
    currency: d.currency,
    periodFrom: reading.periodFrom,
    periodTo: reading.periodTo,
    termIds: (ctx.matches ?? []).flatMap((m) =>
      m.termId && contract?.terms.some((t) => t.id === m.termId) ? [m.termId] : [],
    ),
    chain: [ctx.bill.id],
  };
}

const checkerInput = (
  bills: CheckerBill[],
  payments: Payment[],
  evidence: EvidenceItem[],
  p: Policy,
): CheckerInput => ({
  vendors: ALL_VENDORS,
  contracts: ALL_CONTRACTS,
  evidence,
  payments,
  bills,
  fx: FX,
  policy: p,
});

const paid = (...ps: (Payment | null)[]) => ps.filter((x): x is Payment => x !== null);

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('properties: the engine never makes an improper payment', () => {
  it('every paying decision passes the independent checker', () => {
    let paying = 0;
    const kinds = new Set<string>();
    fc.assert(
      fc.property(withEvidence(scenario, 'a'), policy, ([s, evidence], p) => {
        const ctx = contextFor(s, evidence, p);
        const d = decide(ctx);
        expect(d.payNowMinor).toBeGreaterThanOrEqual(0);
        const payment = paymentFor(ctx, d);
        if (!payment) return;
        paying++;
        kinds.add(s.contract.type);
        const violations = checkInvariants(
          checkerInput([checkerBill(ctx, d)], [payment], evidence, p),
        );
        expect(violations).toEqual([]);
      }),
      RUNS,
    );
    // the generator must actually reach paying decisions, or the property proves nothing
    expect(paying).toBeGreaterThan(30);
    expect([...kinds].sort()).toEqual(['goods', 'hourly', 'milestone', 'retainer', 'usage']);
  });

  it('never pays a bill that carries a foreign destination or a payout change', () => {
    let planted = 0;
    let wouldPay = 0;
    fc.assert(
      fc.property(withEvidence(scenario, 'a'), ([s, evidence]) => {
        if (!s.fraud) return;
        planted++;
        const d = decide(contextFor(s, evidence, DEFAULT_POLICY));
        expect(['PAY', 'PAY_PART']).not.toContain(d.outcome);
        expect(d.payNowMinor).toBe(0);
        const clean = decide(contextFor(s, evidence, DEFAULT_POLICY, {}, false));
        if (clean.payNowMinor > 0) wouldPay++;
      }),
      RUNS,
    );
    expect(planted).toBeGreaterThan(30);
    // the fraud, and nothing else, is what stops these bills
    expect(wouldPay).toBeGreaterThan(5);
  });

  it('a corrected bill never pays the already-paid part twice', () => {
    let both = 0;
    const revisionOf = (s: Scenario) =>
      withEvidence(honest(s.contract), 'b').map(([r, more]) => ({ r, more }));
    fc.assert(
      fc.property(
        withEvidence(honestScenario, 'a').chain(([s, own]) =>
          fc.tuple(fc.constant(s), fc.constant(own), revisionOf(s), fc.boolean()),
        ),
        ([first, own, { r: second, more }, byPerson]) => {
          const evidence = [...own, ...more];
          const p = DEFAULT_POLICY;
          const ctx1 = contextFor(first, evidence, p, { billId: 'b1' });
          const d1 = decide(ctx1);
          const p1 = byPerson ? personPaymentFor(ctx1, d1) : paymentFor(ctx1, d1);

          const revision = {
            ...second,
            reading: { ...second.reading, revisionOf: first.reading.invoiceNumber },
          };
          const ctx2 = contextFor(revision, evidence, p, {
            billId: 'b2',
            chain: ['b2', 'b1'],
            case: { paidMinor: p1?.amountMinor ?? 0, askedAt: '2026-10-31T18:00:00Z' },
            history: [historyOf(ctx1, d1, p1)],
          });
          const d2 = decide(ctx2);
          const p2 = paymentFor(ctx2, d2);
          if (p1 && p2) both++;
          const violations = checkInvariants(
            checkerInput(
              [checkerBill(ctx1, d1, 'SUPERSEDED'), checkerBill(ctx2, d2)],
              paid(p1, p2),
              evidence,
              p,
            ),
          );
          expect(violations).toEqual([]);
        },
      ),
      RUNS,
    );
    expect(both).toBeGreaterThanOrEqual(10);
  });

  it('an independent second bill on the same contract never double-pays', () => {
    let both = 0;
    const invoiceFor = (first: string | null) =>
      fc.oneof(
        // equal after normalization
        {
          weight: 1,
          arbitrary: fc.constant((first ?? 'INV-2026-10').toLowerCase().replace(/-/g, ' ')),
        },
        { weight: 2, arbitrary: fc.constant('INV-2026-11') },
        { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
      );
    const SEPTEMBER = { periodFrom: '2026-09-01', periodTo: '2026-09-30', issueDate: '2026-09-30' };
    const pair = fc
      .constantFrom(...ALL_CONTRACTS)
      .chain((c) =>
        fc.tuple(
          honest(c),
          honest(c),
          fc.oneof(
            { weight: 3, arbitrary: fc.constant(true) },
            { weight: 1, arbitrary: fc.constant(false) },
          ),
          fc.boolean(),
        ),
      )
      .chain(([first, raw, otherMonth, byPerson]) =>
        invoiceFor(first.reading.invoiceNumber).map((invoiceNumber) => {
          const second: Scenario = {
            ...raw,
            reading: {
              ...raw.reading,
              invoiceNumber,
              ...(otherMonth ? SEPTEMBER : {}),
            },
          };
          return { first, second, byPerson };
        }),
      )
      .chain((x) =>
        fc.tuple(fc.constant(x), evidenceFor(x.first, 'a'), evidenceFor(x.second, 'b')),
      );
    fc.assert(
      fc.property(pair, ([{ first, second, byPerson }, own, more]) => {
        const evidence = [...own, ...more];
        const p = DEFAULT_POLICY;
        const ctx1 = contextFor(first, evidence, p, { billId: 'b1' });
        const d1 = decide(ctx1);
        const p1 = byPerson ? personPaymentFor(ctx1, d1) : paymentFor(ctx1, d1);
        const ctx2 = contextFor(second, evidence, p, {
          billId: 'b2',
          history: [historyOf(ctx1, d1, p1)],
        });
        const d2 = decide(ctx2);
        const p2 = paymentFor(ctx2, d2);
        if (p1 && p2) both++;
        const status1: BillStatus =
          p1?.decidedBy === 'person' ? 'APPROVED' : statusForOutcome(d1.outcome);
        const violations = checkInvariants(
          checkerInput(
            [checkerBill(ctx1, d1, status1), checkerBill(ctx2, d2)],
            paid(p1, p2),
            evidence,
            p,
          ),
        );
        expect(violations).toEqual([]);
      }),
      RUNS,
    );
    expect(both).toBeGreaterThanOrEqual(10);
  });

  it('tightening minReadingConfidence or autoPayLimit never turns a non-PAY into PAY', () => {
    fc.assert(
      fc.property(
        withEvidence(scenario, 'a'),
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
