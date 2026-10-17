/**
 * Global policy: immutable versions, what-if preview against history before saving (F8), and
 * natural-language changes compiled to a validated patch that a person reviews.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  canonicalJson,
  decide,
  formatPercent,
  formatUsd,
  PolicyTermsSchema,
  type DecisionContext,
  type Outcome,
  type PolicyTerms,
} from '@mandato/domain';
import { decisions, invoices, policies, users } from '../db/schema';
import { forbidden, newId } from '../lib/common';
import {
  currentPolicy,
  loadHistory,
  loadMandates,
  loadOrganization,
  loadPayees,
  profileOf,
} from './context';
import { nowIso, withOrgLock, type Deps } from './deps';
import { appendLedger } from './ledger';

export async function getPolicy(deps: Deps, orgId: string) {
  const current = await currentPolicy(deps.db, orgId);
  const versions = await deps.db
    .select({
      version: policies.version,
      note: policies.note,
      createdAt: policies.createdAt,
      createdBy: policies.createdBy,
    })
    .from(policies)
    .where(eq(policies.orgId, orgId))
    .orderBy(desc(policies.version));
  return {
    version: current.version,
    terms: current.terms,
    note: current.note,
    createdAt: current.createdAt.toISOString(),
    createdBy: current.createdBy,
    versions: versions.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
  };
}

export interface PolicyChange {
  label: string;
  from: string;
  to: string;
}

export function describePolicyChanges(before: PolicyTerms, after: PolicyTerms): PolicyChange[] {
  const changes: PolicyChange[] = [];
  const money = (label: string, a: number, b: number) => {
    if (a !== b) changes.push({ label, from: formatUsd(a), to: formatUsd(b) });
  };
  money(
    'Límite por pago sin aprobación',
    before.autonomousLimitUsdCents,
    after.autonomousLimitUsdCents,
  );
  money(
    'Doble aprobación por encima de',
    before.dualApprovalAboveUsdCents,
    after.dualApprovalAboveUsdCents,
  );
  money('Presupuesto mensual', before.monthlyBudgetUsdCents, after.monthlyBudgetUsdCents);
  if (before.allowedCurrencies.join() !== after.allowedCurrencies.join()) {
    changes.push({
      label: 'Monedas permitidas',
      from: before.allowedCurrencies.join(', '),
      to: after.allowedCurrencies.join(', '),
    });
  }
  if (before.minExtractionConfidence !== after.minExtractionConfidence) {
    changes.push({
      label: 'Confianza mínima de lectura',
      from: formatPercent(before.minExtractionConfidence),
      to: formatPercent(after.minExtractionConfidence),
    });
  }
  const days = (label: string, a: number, b: number) => {
    if (a !== b) changes.push({ label, from: `${a} días`, to: `${b} días` });
  };
  days('Ventana de cobros repetidos', before.duplicateWindowDays, after.duplicateWindowDays);
  days('Antigüedad máxima de una factura', before.maxInvoiceAgeDays, after.maxInvoiceAgeDays);
  days('Plazo de pago por defecto', before.defaultPaymentTermsDays, after.defaultPaymentTermsDays);
  // JSONB reorders object keys: compare canonically.
  if (canonicalJson(before.fx.unitsPerUsd) !== canonicalJson(after.fx.unitsPerUsd)) {
    changes.push({
      label: 'Tasas de cambio',
      from: Object.entries(before.fx.unitsPerUsd)
        .map(([c, r]) => `${c} ${r}`)
        .join(' · '),
      to: Object.entries(after.fx.unitsPerUsd)
        .map(([c, r]) => `${c} ${r}`)
        .join(' · '),
    });
  }
  return changes;
}

export interface PreviewChange {
  invoiceId: string;
  ref: string;
  title: string | null;
  periodKey: string;
  from: Outcome;
  to: Outcome;
  reason: string;
}

export interface PolicyPreview {
  evaluated: number;
  changes: PreviewChange[];
  becomesPay: number;
  becomesEscalate: number;
  becomesHold: number;
  policyChanges: PolicyChange[];
}

/**
 * Replays every decided bill with the current and the proposed policy, under the same payees,
 * mandates and history, and reports the bills whose outcome would change.
 */
export async function previewPolicy(
  deps: Deps,
  orgId: string,
  proposedInput: PolicyTerms,
): Promise<PolicyPreview> {
  const proposed = PolicyTermsSchema.parse(proposedInput);
  const { db } = deps;
  const org = await loadOrganization(db, orgId);
  const current = await currentPolicy(db, orgId);
  const payees = await loadPayees(db, orgId);
  const mandates = await loadMandates(db, orgId);
  const history = await loadHistory(db, orgId);
  const rows = await db
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(decisions, eq(decisions.invoiceId, invoices.id))
    .where(
      and(
        eq(invoices.orgId, orgId),
        inArray(invoices.status, ['PAID', 'HELD', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED']),
      ),
    )
    .orderBy(asc(invoices.decidedAt), asc(invoices.seq));

  const changes: PreviewChange[] = [];
  for (const { invoice } of rows) {
    const decidedAt = (invoice.decidedAt ?? invoice.receivedAt).toISOString();
    const before = history.filter((h) => h.invoiceId !== invoice.id && h.decidedAt < decidedAt);
    const committed = before
      .filter((h) => h.status === 'PAID' || h.status === 'APPROVED')
      .reduce((s, h) => s + (h.usdCents ?? 0), 0);
    const base: Omit<DecisionContext, 'policy'> = {
      now: decidedAt,
      organization: profileOf(org),
      invoice: {
        extraction: invoice.extraction ?? null,
        extractionError: invoice.extractionMeta.error,
        source: invoice.source,
        instructionScan: {
          matched: invoice.extractionMeta.scanPhrases.length > 0,
          phrases: invoice.extractionMeta.scanPhrases,
        },
      },
      payees,
      mandates,
      history: before,
      treasury: { availableUsdCents: org.treasuryBalanceUsdCents - committed },
      requester: invoice.requester,
    };
    const a = decide({
      ...base,
      policy: { version: current.version, terms: current.terms as PolicyTerms },
    });
    const b = decide({ ...base, policy: { version: current.version + 1, terms: proposed } });
    if (a.outcome !== b.outcome) {
      const failing = b.results
        .filter((r) => r.status === 'fail')
        .map((r) => r.title.toLowerCase());
      changes.push({
        invoiceId: invoice.id,
        ref: invoice.ref,
        title: invoice.title,
        periodKey: invoice.periodKey,
        from: a.outcome,
        to: b.outcome,
        reason:
          b.outcome === 'PAY'
            ? 'Con la política nueva cumpliría todas las reglas.'
            : `Fallaría: ${failing.join(', ') || 'una verificación'}.`,
      });
    }
  }
  return {
    evaluated: rows.length,
    changes,
    becomesPay: changes.filter((c) => c.to === 'PAY').length,
    becomesEscalate: changes.filter((c) => c.to === 'ESCALATE').length,
    becomesHold: changes.filter((c) => c.to === 'HOLD').length,
    policyChanges: describePolicyChanges(current.terms as PolicyTerms, proposed),
  };
}

export async function updatePolicy(
  deps: Deps,
  input: { orgId: string; userId: string; terms: PolicyTerms; note: string | null; at?: string },
) {
  const at = nowIso(deps, input.at);
  const terms = PolicyTermsSchema.parse(input.terms);
  const version = await withOrgLock(deps.db, input.orgId, async (tx) => {
    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.orgId, input.orgId)));
    if (!user?.canSign)
      throw forbidden('Solo quien puede firmar acuerdos cambia la política de pagos.');
    const current = await currentPolicy(tx, input.orgId);
    const next = current.version + 1;
    await tx.insert(policies).values({
      id: newId('pol'),
      orgId: input.orgId,
      version: next,
      terms,
      note: input.note,
      createdBy: user.id,
      createdAt: new Date(at),
    });
    await appendLedger(tx, input.orgId, [
      {
        type: 'POLICY_VERSION_CREATED',
        entityId: `policy:${next}`,
        actor: { kind: 'user', id: user.id, name: user.name },
        at,
        payload: { version: next, terms, note: input.note },
      },
    ]);
    return next;
  });
  deps.bus.publish({ type: 'policy.changed', orgId: input.orgId, at, data: { version } });
  return getPolicy(deps, input.orgId);
}
