import { and, eq } from 'drizzle-orm';
import { periodKeyOf, periodMetrics, type PolicyTerms } from '@mandato/domain';
import { approvalRequests, invoices, proposals } from '../db/schema';
import { latestAudit } from './audit';
import { committedUsdCents, currentPolicy, loadOrganization } from './context';
import type { Deps } from './deps';
import { listInvoices } from './views';

export async function overview(deps: Deps, orgId: string) {
  const { db } = deps;
  const org = await loadOrganization(db, orgId);
  const policy = await currentPolicy(db, orgId);
  const terms = policy.terms as PolicyTerms;
  const now = deps.clock.now().toISOString();
  const currentPeriod = periodKeyOf(now, org.timeZone);

  const rows = await db.select().from(invoices).where(eq(invoices.orgId, orgId));
  const periods = periodMetrics(
    rows.map((r) => ({
      periodKey: r.periodKey,
      outcome: r.outcome,
      status: r.status,
      usdCents: r.usdCents,
    })),
  );
  const accepted = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.orgId, orgId), eq(proposals.status, 'accepted')));
  const pendingProposals = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(and(eq(proposals.orgId, orgId), eq(proposals.status, 'pending')));
  const pendingApprovals = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.orgId, orgId), eq(approvalRequests.status, 'pending')));
  const committedAll = await committedUsdCents(db, orgId);
  const audit = await latestAudit(deps, orgId);

  const ladder = periods.map((p) => ({
    periodKey: p.periodKey,
    autonomy: p.autonomy,
    total: p.total,
    paidByAgent: p.paidByAgent,
    heldByAgent: p.heldByAgent,
    escalated: p.escalated,
    signedInPeriod: accepted.filter((a) => {
      const resolved = a.resolvedAt?.toISOString();
      return resolved ? periodKeyOf(resolved, org.timeZone) === p.periodKey : false;
    }).length,
  }));

  return {
    organization: { id: org.id, name: org.name, legalName: org.legalName },
    now,
    currentPeriod,
    policyVersion: policy.version,
    budgetUsdCents: terms.monthlyBudgetUsdCents,
    autonomousLimitUsdCents: terms.autonomousLimitUsdCents,
    periods: periods.map((p) => ({
      ...p,
      budgetUsdCents: terms.monthlyBudgetUsdCents,
      remainingUsdCents: terms.monthlyBudgetUsdCents - p.committedUsdCents,
    })),
    treasury: {
      balanceUsdCents: org.treasuryBalanceUsdCents,
      committedUsdCents: committedAll,
      availableUsdCents: org.treasuryBalanceUsdCents - committedAll,
    },
    pendingApprovals: pendingApprovals.length,
    pendingProposals: pendingProposals.length,
    signedProposals: accepted.length,
    latestAudit: audit
      ? {
          id: audit.id,
          at: audit.createdAt,
          ok: audit.report.ok,
          violations: audit.report.findings.length,
          paymentsChecked: audit.report.paymentsChecked,
          decisionsChecked: audit.report.decisionsChecked,
          chainIntact: audit.report.chainIntact,
        }
      : null,
    ladder,
    recent: await listInvoices(db, orgId, { limit: 12 }),
  };
}
