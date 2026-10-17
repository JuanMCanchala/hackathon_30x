/**
 * Property-based tests: the engine is attacked with thousands of random — often adversarial —
 * bills, histories, balances and requesters. The oracle below re-states the safety invariants
 * independently of the engine's code (SYSTEM_DESIGN §7).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  RULES,
  decide,
  normalizeDestination,
  normalizeInvoiceNumber,
  normalizeTaxId,
  parseDecimalToMinor,
  toUsdCentsCeil,
  toleranceBounds,
  type DecisionContext,
  type ExtractedInvoice,
  type HistoryInvoice,
  type InvoiceStatus,
  type Requester,
} from '../src';
import { MANDATES, PAYEES, POLICY, context, extraction } from './fixtures';

const NUMBERS = ['CC-2026-09', 'cc 2026 0009', 'F-2026-0915', 'TB-1009', 'CN-0915', 'X-1', null];
const AMOUNTS = [
  '14000000.00',
  '72000.00',
  '504.00',
  '480.00',
  '185000.00',
  '9000000.00',
  '1.00',
  '999999999.00',
  '-50.00',
  '12.345',
  null,
];
const CURRENCIES = ['COP', 'MXN', 'USD', 'BRL', 'PEN', 'usd', null];
const DESTINATIONS = [
  ...PAYEES.map((p) => p.destination.value),
  '@otra.llave',
  '000111222333444555',
  null,
];
const TAX_IDS = [...PAYEES.map((p) => p.taxId), '999999999', null];
const NAMES = [
  ...PAYEES.map((p) => p.name),
  'Valentinа Ríos Mejía',
  'Global Consulting Partners LLC',
  null,
];
const DATES = [
  '2026-08-15',
  '2026-09-01',
  '2026-09-03',
  '2026-10-01',
  '2027-01-01',
  '2026-02-30',
  null,
];
const STATUSES: InvoiceStatus[] = ['PAID', 'APPROVED', 'PENDING_APPROVAL', 'HELD', 'REJECTED'];

/** Bills that match a signed mandate exactly; mutations then push them off the happy path. */
const TEMPLATES = [
  {
    name: 'Valentina Ríos Mejía',
    taxId: 'CC 1020304050',
    destination: '@valrios',
    currency: 'COP',
    total: '14000000.00',
    number: 'CC-2026-09',
    category: 'contractor',
  },
  {
    name: 'Mateo Herrera Garza',
    taxId: 'HEGM900101AB1',
    destination: '012180001234567891',
    currency: 'MXN',
    total: '72000.00',
    number: 'F-2026-0915',
    category: 'contractor',
  },
  {
    name: 'Código Norte S.A. de C.V.',
    taxId: 'CNO150301XY9',
    destination: '014180009876543210',
    currency: 'MXN',
    total: '90000.00',
    number: 'CN-0915',
    category: 'services',
  },
  {
    name: 'Tablero Software LLC',
    taxId: '87-7654321',
    destination: null,
    currency: 'USD',
    total: '504.00',
    number: 'TB-1009',
    category: 'software',
  },
] as const;

/** Each field keeps the template value or, with ~20% probability, is replaced by an adversarial one. */
const maybe = <T>(keep: T, alternatives: readonly T[]) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant(keep) },
    { weight: 1, arbitrary: fc.constantFrom(...alternatives) },
  );

const arbExtraction: fc.Arbitrary<ExtractedInvoice | null> = fc.option(
  fc.constantFrom(...TEMPLATES).chain((t) =>
    fc
      .record({
        documentType: maybe<ExtractedInvoice['documentType']>('invoice', [
          'cuenta_de_cobro',
          'credit_note',
          'receipt',
          'unknown',
        ]),
        name: maybe<string | null>(t.name, NAMES),
        taxId: maybe<string | null>(t.taxId, TAX_IDS),
        number: maybe<string | null>(t.number, NUMBERS),
        issueDate: maybe<string | null>('2026-09-01', DATES),
        dueDate: maybe<string | null>('2026-09-10', DATES),
        currency: maybe<string | null>(t.currency, CURRENCIES),
        total: maybe<string | null>(t.total, AMOUNTS),
        destination: maybe<string | null>(t.destination, DESTINATIONS),
        confidence: maybe(0.97, [0.5, 0.84, 0.86, 0.6]),
        instructions: maybe(false, [true]),
        billTo: maybe<string | null>('Andes Labs Inc.', ['Otra Empresa S.A.S.', null]),
        items: maybe<'none' | 'match' | 'mismatch'>('none', ['match', 'mismatch']),
      })
      .map((r) =>
        extraction({
          documentType: r.documentType,
          issuer: { name: r.name, taxId: r.taxId },
          invoiceNumber: r.number,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          servicePeriod: r.issueDate?.slice(0, 7) ?? null,
          currency: r.currency,
          total: r.total,
          subtotal: r.total,
          amountInWords: null,
          amountInWordsValue: null,
          lineItems:
            r.items === 'none' || !r.total
              ? []
              : [
                  {
                    description: 'x',
                    quantity: '1',
                    unitPrice: null,
                    amount: r.items === 'match' ? r.total : '1.00',
                  },
                ],
          billTo: { name: r.billTo, taxId: null },
          payout: { method: null, destination: r.destination },
          category: t.category,
          agentInstructions: {
            detected: r.instructions,
            quote: r.instructions ? 'pre-aprobada' : null,
          },
          confidence: {
            issuer: r.confidence,
            invoiceNumber: r.confidence,
            issueDate: r.confidence,
            dueDate: r.confidence,
            currency: 0.99,
            total: r.confidence,
            payout: r.confidence,
          },
        }),
      ),
  ),
  { freq: 25 },
);

const arbHistory: fc.Arbitrary<HistoryInvoice[]> = fc
  .array(
    fc.record({
      payee: fc.constantFrom(...PAYEES.map((p) => p.id), null),
      number: fc.constantFrom(...NUMBERS),
      amount: fc.constantFrom(1_400_000_000, 7_200_000, 50_400, 18_500_000, 100),
      currency: fc.constantFrom('COP', 'MXN', 'USD'),
      usd: fc.integer({ min: 0, max: 900_000 }),
      status: fc.constantFrom(...STATUSES),
      period: fc.constantFrom('2026-09', '2026-08'),
    }),
    { maxLength: 4 },
  )
  .map((list) =>
    list.map((h, i) => ({
      invoiceId: `inv_${i}`,
      ref: `MND-${i}`,
      payeeId: h.payee,
      issuerTaxIdNorm: null,
      issuerNameFolded: null,
      destinationNorm: null,
      invoiceNumber: h.number,
      invoiceNumberNorm: normalizeInvoiceNumber(h.number),
      amountMinor: h.amount,
      currency: h.currency,
      usdCents: h.usd,
      issueDate: `${h.period}-01`,
      servicePeriod: h.period,
      periodKey: h.period,
      status: h.status,
      decidedAt: `${h.period}-02T12:00:00Z`,
    })),
  );

const arbRequester: fc.Arbitrary<Requester> = fc.oneof(
  fc.constant<Requester>({ kind: 'user', userId: 'usr_laura', name: 'Laura Méndez' }),
  fc
    .record({
      categories: fc.subarray(['contractor', 'software', 'services'] as const, { minLength: 1 }),
      max: fc.integer({ min: 1, max: 2_000_000 }),
    })
    .map<Requester>((s) => ({
      kind: 'agent',
      agentId: 'agt_1',
      name: 'Agente',
      scope: { categories: [...s.categories], maxPerRequestUsdCents: s.max },
    })),
);

const arbContext: fc.Arbitrary<DecisionContext> = fc
  .record({
    extraction: arbExtraction,
    history: arbHistory,
    available: fc.integer({ min: 0, max: 30_000_000 }),
    requester: arbRequester,
    blocked: fc.boolean(),
    scan: fc.boolean(),
  })
  .map((r) =>
    context({
      extraction: r.extraction,
      history: r.history,
      availableUsdCents: r.available,
      requester: r.requester,
      payees: r.blocked
        ? PAYEES.map((p, i) => (i === 0 ? { ...p, status: 'blocked' as const } : p))
        : PAYEES,
      scanPhrases: r.scan ? ['sin revision'] : [],
    }),
  );

/** Independent statement of what must be true whenever the engine decides PAY. */
function assertSafePayment(ctx: DecisionContext) {
  const x = ctx.invoice.extraction;
  const terms = ctx.policy.terms;
  expect(x).not.toBeNull();
  if (!x) return;
  expect(['invoice', 'cuenta_de_cobro']).toContain(x.documentType);
  expect(x.agentInstructions.detected || ctx.invoice.instructionScan.matched).toBe(false);

  const payee = ctx.payees.find(
    (p) =>
      (x.issuer.taxId && normalizeTaxId(p.taxId) === normalizeTaxId(x.issuer.taxId)) ||
      (x.payout.destination &&
        normalizeDestination(p.destination.value) === normalizeDestination(x.payout.destination)),
  );
  expect(payee, 'paid to a registered payee').toBeDefined();
  if (!payee) return;
  expect(payee.status).toBe('active');
  if (x.payout.destination) {
    expect(normalizeDestination(x.payout.destination)).toBe(
      normalizeDestination(payee.destination.value),
    );
  }

  const currency = x.currency!.trim().toUpperCase();
  const amount = parseDecimalToMinor(x.total, currency);
  expect(amount).not.toBeNull();
  expect(amount!).toBeGreaterThan(0);
  const mandate = ctx.mandates.find((m) => m.payeeId === payee.id && m.status === 'active');
  expect(mandate, 'inside a signed mandate').toBeDefined();
  if (!mandate || amount === null) return;
  expect(currency).toBe(mandate.terms.currency);
  const a = mandate.terms.amount;
  if (a.kind === 'up_to') expect(amount).toBeLessThanOrEqual(a.maxMinor);
  else {
    const { min, max } = toleranceBounds(a.amountMinor, a.tolerancePct);
    expect(amount).toBeGreaterThanOrEqual(min);
    expect(amount).toBeLessThanOrEqual(max);
  }

  const usd = toUsdCentsCeil(amount, currency, terms.fx)!;
  expect(usd).toBeLessThanOrEqual(
    Math.max(terms.autonomousLimitUsdCents, mandate.terms.autonomousLimitOverrideUsdCents ?? 0),
  );
  const committed = ctx.history
    .filter((h) => h.periodKey === '2026-09' && (h.status === 'PAID' || h.status === 'APPROVED'))
    .reduce((s, h) => s + (h.usdCents ?? 0), 0);
  expect(committed + usd).toBeLessThanOrEqual(terms.monthlyBudgetUsdCents);
  expect(usd).toBeLessThanOrEqual(ctx.treasury.availableUsdCents);

  const active = ctx.history.filter(
    (h) => h.payeeId === payee.id && ['PAID', 'APPROVED', 'PENDING_APPROVAL'].includes(h.status),
  );
  expect(active.some((h) => h.invoiceNumberNorm === normalizeInvoiceNumber(x.invoiceNumber))).toBe(
    false,
  );
  expect(active.filter((h) => h.periodKey === '2026-09').length + 1).toBeLessThanOrEqual(
    mandate.terms.maxInvoicesPerPeriod,
  );

  if (ctx.requester.kind === 'agent') {
    expect(ctx.requester.scope.categories).toContain(payee.category);
    expect(usd).toBeLessThanOrEqual(ctx.requester.scope.maxPerRequestUsdCents);
  }
}

describe('engine properties', () => {
  it('never pays outside the rules, whatever the reader returns', () => {
    let payments = 0;
    fc.assert(
      fc.property(arbContext, (ctx) => {
        const d = decide(ctx);
        if (d.outcome === 'PAY') {
          payments++;
          assertSafePayment(ctx);
        }
      }),
      { numRuns: 4000, seed: 20261016 },
    );
    // The generator must actually exercise the PAY path, or the property proves nothing.
    expect(payments).toBeGreaterThan(20);
  });

  it('explains every decision', () => {
    fc.assert(
      fc.property(arbContext, (ctx) => {
        const d = decide(ctx);
        expect(d.results).toHaveLength(RULES.length);
        expect(d.summary.length).toBeGreaterThan(10);
        if (d.outcome !== 'PAY') expect(d.counterfactual.length).toBeGreaterThan(0);
        for (const r of d.results) {
          if (r.status === 'fail') expect(r.remedy).toBeTruthy();
        }
      }),
      { numRuns: 1500, seed: 7 },
    );
  });

  it('tightening the policy never turns a non-payment into a payment', () => {
    fc.assert(
      fc.property(
        arbContext,
        fc.record({
          limit: fc.integer({ min: 0, max: POLICY.autonomousLimitUsdCents }),
          budget: fc.integer({ min: 0, max: POLICY.monthlyBudgetUsdCents }),
          confidence: fc.double({ min: POLICY.minExtractionConfidence, max: 1, noNaN: true }),
          currencies: fc.subarray(POLICY.allowedCurrencies, { minLength: 1 }),
        }),
        (ctx, tight) => {
          const tighter: DecisionContext = {
            ...ctx,
            policy: {
              version: 2,
              terms: {
                ...ctx.policy.terms,
                autonomousLimitUsdCents: tight.limit,
                monthlyBudgetUsdCents: tight.budget,
                minExtractionConfidence: tight.confidence,
                allowedCurrencies: tight.currencies,
              },
            },
          };
          if (decide(tighter).outcome === 'PAY') expect(decide(ctx).outcome).toBe('PAY');
        },
      ),
      { numRuns: 2000, seed: 99 },
    );
  });

  it('revoking mandates never creates payments', () => {
    fc.assert(
      fc.property(arbContext, fc.subarray(MANDATES), (ctx, remaining) => {
        const fewer = { ...ctx, mandates: remaining };
        if (decide(fewer).outcome === 'PAY') expect(decide(ctx).outcome).toBe('PAY');
      }),
      { numRuns: 1500, seed: 3 },
    );
  });
});
