import { desc, eq } from 'drizzle-orm';
import { auditLedger, type AuditReport } from '@mandato/domain';
import { auditRuns } from '../db/schema';
import { newId, sha256 } from '../lib/common';
import { nowIso, withOrgLock, type Deps } from './deps';
import { appendLedger, readLedger, SYSTEM_ACTOR } from './ledger';

export interface AuditRunView {
  id: string;
  createdAt: string;
  report: AuditReport;
}

/** Replays the ledger through the independent auditor and records the run (ADR-0006). */
export async function runAudit(
  deps: Deps,
  orgId: string,
  requestedBy?: { id: string; name: string },
  at?: string,
): Promise<AuditRunView> {
  const when = nowIso(deps, at);
  const run = await withOrgLock(deps.db, orgId, async (tx) => {
    const entries = await readLedger(tx, orgId);
    const report = auditLedger(entries, sha256);
    const id = newId('aud');
    await tx.insert(auditRuns).values({ id, orgId, report, createdAt: new Date(when) });
    await appendLedger(tx, orgId, [
      {
        type: 'AUDIT_RUN',
        entityId: id,
        actor: requestedBy
          ? { kind: 'user', id: requestedBy.id, name: requestedBy.name }
          : SYSTEM_ACTOR,
        at: when,
        payload: {
          ok: report.ok,
          violations: report.findings.length,
          decisionsChecked: report.decisionsChecked,
        },
      },
    ]);
    return { id, createdAt: when, report };
  });
  deps.bus.publish({
    type: 'audit.completed',
    orgId,
    at: when,
    data: { auditId: run.id, ok: run.report.ok, violations: run.report.findings.length },
  });
  return run;
}

export async function latestAudit(deps: Deps, orgId: string): Promise<AuditRunView | null> {
  const [row] = await deps.db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.orgId, orgId))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);
  return row ? { id: row.id, createdAt: row.createdAt.toISOString(), report: row.report } : null;
}
