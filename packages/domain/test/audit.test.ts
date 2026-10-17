import { describe, expect, it } from 'vitest';
import { auditLedger, decide, type Decision, type LedgerPayloads } from '../src';
import { MANDATE_VALENTINA, ORG, POLICY, VALENTINA, context, extraction } from './fixtures';
import { LedgerBuilder, sha256 } from './ledger-helpers';

function decisionPayload(
  decision: Decision,
  invoiceId: string,
  ref: string,
): LedgerPayloads['DECISION_RECORDED'] {
  return {
    invoiceId,
    ref,
    outcome: decision.outcome,
    approvalsRequired: decision.approvalsRequired,
    policyVersion: 1,
    facts: decision.facts,
    results: decision.results.map((r) => ({
      id: r.id,
      status: r.status,
      safeSkip: r.safeSkip,
      onFail: r.onFail,
    })),
    summary: decision.summary,
    counterfactual: decision.counterfactual,
    engineVersion: decision.engineVersion,
  };
}

function seeded() {
  const ledger = new LedgerBuilder();
  ledger.append('ORG_SEEDED', { organization: ORG, treasuryBalanceUsdCents: 25_000_000 });
  for (const [id, name, canApprove] of [
    ['usr_laura', 'Laura Méndez', false],
    ['usr_martin', 'Martín Ocampo', true],
    ['usr_sofia', 'Sofía Herrera', true],
  ] as const) {
    ledger.append('USER_REGISTERED', {
      user: {
        id,
        name,
        email: `${id}@andeslabs.example`,
        role: canApprove ? 'approver' : 'operator',
        canApprove,
        canSign: canApprove,
      },
    });
  }
  ledger.append('POLICY_VERSION_CREATED', { version: 1, terms: POLICY, note: null });
  ledger.append('PAYEE_REGISTERED', { payee: VALENTINA });
  ledger.append('MANDATE_SIGNED', { mandate: MANDATE_VALENTINA, supersedes: null });
  return ledger;
}

function receive(ledger: LedgerBuilder, invoiceId: string, ref: string) {
  ledger.append('INVOICE_RECEIVED', {
    invoiceId,
    ref,
    source: 'dataset',
    documentSha256: null,
    requestedBy: 'usr_laura',
  });
}

describe('auditLedger', () => {
  it('certifies a clean ledger', () => {
    const ledger = seeded();
    receive(ledger, 'inv_1', 'MND-0001');
    const decision = decide(context({ payees: [VALENTINA], mandates: [MANDATE_VALENTINA] }));
    expect(decision.outcome).toBe('PAY');
    ledger.append('DECISION_RECORDED', decisionPayload(decision, 'inv_1', 'MND-0001'));

    const report = auditLedger(ledger.entries, sha256);
    expect(report.ok).toBe(true);
    expect(report.chainIntact).toBe(true);
    expect(report.paymentsChecked).toBe(1);
    expect(report.invariants.every((i) => i.violations === 0)).toBe(true);
  });

  it('detects tampering anywhere in the chain', () => {
    const ledger = seeded();
    receive(ledger, 'inv_1', 'MND-0001');
    const tampered = ledger.entries.map((e) =>
      e.type === 'POLICY_VERSION_CREATED'
        ? {
            ...e,
            payload: {
              version: 1,
              terms: { ...POLICY, autonomousLimitUsdCents: 99_000_000 },
              note: null,
            },
          }
        : e,
    );
    const report = auditLedger(tampered, sha256);
    expect(report.chainIntact).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.findings[0]?.invariant).toBe('I8');
  });

  it('catches a payment the engine should never have made', () => {
    const ledger = seeded();
    receive(ledger, 'inv_1', 'MND-0001');
    const forged = decide(
      context({
        payees: [VALENTINA],
        mandates: [MANDATE_VALENTINA],
        extraction: extraction({
          total: '30000000.00',
          amountInWords: null,
          amountInWordsValue: null,
          lineItems: [],
        }),
      }),
    );
    expect(forged.outcome).toBe('ESCALATE');
    // Pretend a buggy engine had decided PAY with those facts.
    ledger.append('DECISION_RECORDED', {
      ...decisionPayload(forged, 'inv_1', 'MND-0001'),
      outcome: 'PAY',
    });
    const report = auditLedger(ledger.entries, sha256);
    expect(report.ok).toBe(false);
    const violated = new Set(report.findings.map((f) => f.invariant));
    expect(violated.has('I2')).toBe(true); // amount and cap outside the mandate
    expect(violated.has('I3')).toBe(true); // USD 7,500 above the USD 5,000 limit
  });

  it('catches a second payment of the same invoice number', () => {
    const ledger = seeded();
    receive(ledger, 'inv_1', 'MND-0001');
    const first = decide(context({ payees: [VALENTINA], mandates: [MANDATE_VALENTINA] }));
    ledger.append('DECISION_RECORDED', decisionPayload(first, 'inv_1', 'MND-0001'));
    receive(ledger, 'inv_2', 'MND-0002');
    ledger.append('DECISION_RECORDED', decisionPayload(first, 'inv_2', 'MND-0002'));
    const report = auditLedger(ledger.entries, sha256);
    expect(report.findings.map((f) => f.invariant)).toEqual(expect.arrayContaining(['I2', 'I5']));
  });

  it('requires the configured number of distinct approvers', () => {
    const ledger = seeded();
    receive(ledger, 'inv_1', 'MND-0001');
    ledger.append('APPROVAL_REQUESTED', { requestId: 'apr_1', invoiceId: 'inv_1', required: 2 });
    ledger.append('APPROVAL_GIVEN', {
      requestId: 'apr_1',
      invoiceId: 'inv_1',
      userId: 'usr_martin',
      via: 'web',
      note: null,
    });
    ledger.append('APPROVAL_GIVEN', {
      requestId: 'apr_1',
      invoiceId: 'inv_1',
      userId: 'usr_laura',
      via: 'web',
      note: null,
    });
    ledger.append('INVOICE_APPROVED', {
      invoiceId: 'inv_1',
      requestId: 'apr_1',
      usdCents: 2_000_000,
      periodKey: '2026-09',
      approvers: ['usr_martin', 'usr_laura'],
    });
    const report = auditLedger(ledger.entries, sha256);
    expect(report.findings).toEqual([
      expect.objectContaining({
        invariant: 'I7',
        message: 'Aprobada con 1 de 2 aprobaciones válidas.',
      }),
    ]);
  });
});
