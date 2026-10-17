import { describe, expect, it } from 'vitest';
import {
  decide,
  materializeProposal,
  proposalImpact,
  proposeFromApproval,
  type ExtractedInvoice,
  type Mandate,
  type Payee,
} from '../src';
import { CODIGO_NORTE, MANDATES, PAYEES, POLICY, TABLERO, context, extraction } from './fixtures';

const RAFAEL_BILL = extraction({
  issuer: { name: 'Rafael Mendoza Castro', taxId: 'CC 79.555.123', country: 'CO' },
  invoiceNumber: 'RM-001',
  total: '9000000.00',
  subtotal: '9000000.00',
  amountInWords: 'Nueve millones de pesos',
  amountInWordsValue: '9000000',
  lineItems: [
    { description: 'Análisis de datos', quantity: '1', unitPrice: '9000000', amount: '9000000' },
  ],
  payout: { method: 'bre_b', destination: '@rafamendoza' },
  category: 'contractor',
});

const CODIGO_BILL = extraction({
  documentType: 'invoice',
  issuer: { name: 'Código Norte S.A. de C.V.', taxId: 'CNO150301XY9', country: 'MX' },
  invoiceNumber: 'CN-0915',
  currency: 'MXN',
  total: '185000.00',
  subtotal: '185000.00',
  amountInWords: null,
  amountInWordsValue: null,
  lineItems: [],
  payout: { method: 'spei', destination: CODIGO_NORTE.destination.value },
  category: 'services',
});

const TABLERO_BILL = extraction({
  documentType: 'invoice',
  issuer: { name: 'Tablero Software LLC', taxId: '87-7654321', country: 'US' },
  invoiceNumber: 'TB-1009',
  currency: 'USD',
  total: '620.00',
  subtotal: '620.00',
  amountInWords: null,
  amountInWordsValue: null,
  lineItems: [{ description: '52 seats', quantity: '52', unitPrice: '11.923', amount: '620.00' }],
  payout: { method: 'card', destination: null },
  category: 'software',
});

function propose(bill: ExtractedInvoice, payees: Payee[] = PAYEES, mandates: Mandate[] = MANDATES) {
  const decision = decide(context({ extraction: bill, payees, mandates }));
  expect(decision.outcome).toBe('ESCALATE');
  return proposeFromApproval({
    decision,
    extraction: bill,
    policy: POLICY,
    payees,
    mandates,
    approvers: ['Martín Ocampo'],
    approvedAt: '2026-09-04T14:00:00Z',
  });
}

/** Applies a proposal and decides the same kind of bill next month, with empty history. */
function nextMonth(bill: ExtractedInvoice, draft: NonNullable<ReturnType<typeof propose>>) {
  const { payee, mandate, supersedes } = materializeProposal(draft, {
    payeeId: 'pay_new',
    mandateId: 'man_new',
    mandateKey: 'man_new_key',
    signer: { userId: 'usr_martin', name: 'Martín Ocampo' },
    now: '2026-09-04T15:00:00Z',
  });
  const payees = payee ? [...PAYEES, payee] : PAYEES;
  const mandates = [
    ...MANDATES.map((m) => (m.id === supersedes ? { ...m, status: 'superseded' as const } : m)),
    mandate,
  ];
  const october = {
    ...bill,
    invoiceNumber: `${bill.invoiceNumber}-OCT`,
    issueDate: '2026-10-01',
    dueDate: '2026-10-10',
    servicePeriod: '2026-10',
  };
  return decide(context({ extraction: october, payees, mandates, now: '2026-10-03T15:00:00Z' }));
}

describe('proposeFromApproval', () => {
  it('proposes registering a new payee with a mandate, and warns to verify payout details', () => {
    const draft = propose(RAFAEL_BILL);
    expect(draft).not.toBeNull();
    expect(draft!.kind).toBe('register_payee_and_mandate');
    expect(draft!.newPayee).toMatchObject({
      name: 'Rafael Mendoza Castro',
      currency: 'COP',
      destination: { method: 'bre_b', value: '@rafamendoza' },
    });
    expect(draft!.terms.amount).toEqual({
      kind: 'fixed',
      amountMinor: 900_000_000,
      tolerancePct: 0,
    });
    expect(draft!.exposureUsdCentsPerMonth).toBe(225_000);
    expect(draft!.warnings[0]).toContain('Verifica los datos de pago');
    expect(nextMonth(RAFAEL_BILL, draft!).outcome).toBe('PAY');
  });

  it('proposes a signed exception above the global limit', () => {
    const draft = propose(CODIGO_BILL);
    expect(draft!.kind).toBe('update_mandate');
    expect(draft!.baseMandate?.id).toBe('man_codigo_norte');
    expect(draft!.terms.autonomousLimitOverrideUsdCents).toBe(1_000_000);
    expect(draft!.changes.map((c) => c.label)).toContain('Excepción al límite por pago');
    expect(nextMonth(CODIGO_BILL, draft!).outcome).toBe('PAY');
  });

  it('proposes updating the agreed amount of a subscription', () => {
    const draft = propose(TABLERO_BILL);
    expect(draft!.kind).toBe('update_mandate');
    expect(draft!.terms.amount).toEqual({ kind: 'fixed', amountMinor: 62_000, tolerancePct: 10 });
    expect(draft!.terms.periodCapMinor).toBe(68_200);
    expect(draft!.rationale).toContain('Martín Ocampo aprobó pagarle USD 620,00 a Tablero.io');
    expect(nextMonth(TABLERO_BILL, draft!).outcome).toBe('PAY');
  });

  it('proposes a mandate for a registered payee without one', () => {
    const mandates = MANDATES.filter((m) => m.payeeId !== TABLERO.id);
    const bill = { ...TABLERO_BILL, total: '480.00', subtotal: '480.00', lineItems: [] };
    const draft = propose(bill, PAYEES, mandates);
    expect(draft!.kind).toBe('create_mandate');
    expect(draft!.payeeId).toBe(TABLERO.id);
  });

  it('never proposes changing payout details', () => {
    expect(propose(extraction({ payout: { destination: '@nueva.llave' } }))).toBeNull();
  });

  it('never learns from bills with injected instructions', () => {
    const bill = { ...RAFAEL_BILL, agentInstructions: { detected: true, quote: 'pre-aprobada' } };
    expect(propose(bill)).toBeNull();
  });

  it('never learns from budget or currency problems', () => {
    const pen = {
      ...RAFAEL_BILL,
      currency: 'PEN',
      total: '9000.00',
      subtotal: '9000.00',
      amountInWords: null,
      amountInWordsValue: null,
      lineItems: [],
    };
    expect(propose(pen)).toBeNull();
  });

  it('measures how many past escalations a proposal would have avoided', () => {
    const draft = propose(TABLERO_BILL)!;
    const count = proposalImpact(
      draft,
      [
        {
          payeeId: TABLERO.id,
          issuerTaxIdNorm: null,
          destinationNorm: null,
          failingRules: ['mandate.amount'],
          currency: 'USD',
          amountMinor: 61_500,
        },
        {
          payeeId: TABLERO.id,
          issuerTaxIdNorm: null,
          destinationNorm: null,
          failingRules: ['payee.destination_matches'],
          currency: 'USD',
          amountMinor: 62_000,
        },
        {
          payeeId: 'other',
          issuerTaxIdNorm: null,
          destinationNorm: null,
          failingRules: ['mandate.amount'],
          currency: 'USD',
          amountMinor: 62_000,
        },
      ],
      { payeeId: TABLERO.id, taxIdNorm: null, destinationNorm: null },
    );
    expect(count).toBe(1);
  });
});
