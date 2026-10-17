/**
 * End-to-end through the real services and a real (in-memory) PostgreSQL: both scripted
 * months, the live files and the attack lab, with a perfect reader.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { ATTACKS, AUGUST, LIVE, SEPTEMBER } from '@mandato/dataset';
import type { Container } from '../src/container';
import { decisions, invoices, ledgerEntries, payments, proposals } from '../src/db/schema';
import { runAudit } from '../src/services/audit';
import { DEMO_ORG_ID, launchAttack, runLiveFile, runMonth } from '../src/services/demo';
import { overview } from '../src/services/metrics';
import { demoContainer } from './helpers';

let container: Container;

async function byDataset(id: string) {
  const [row] = await container.deps.db
    .select({ invoice: invoices, decision: decisions })
    .from(invoices)
    .innerJoin(decisions, eq(decisions.invoiceId, invoices.id))
    .where(eq(invoices.datasetId, id));
  if (!row) throw new Error(`no invoice for ${id}`);
  return row;
}

beforeAll(async () => {
  container = await demoContainer();
});
afterAll(async () => {
  await container.database.close();
});

describe('guided months', () => {
  it('processes August with the team actions interleaved', async () => {
    const result = await runMonth(container.deps, '2026-08', { paceMs: 0 });
    expect(result.processed).toBe(AUGUST.length);
    for (const bill of AUGUST) {
      const { decision } = await byDataset(bill.id);
      const failing = decision.results
        .filter((r) => r.status === 'fail')
        .map((r) => r.id)
        .sort();
      expect({ id: bill.id, outcome: decision.outcome, failing }).toEqual({
        id: bill.id,
        outcome: bill.expected.outcome,
        failing: [...bill.expected.failing].sort(),
      });
    }
  });

  it('turned the approved, teachable escalations into signed mandates', async () => {
    const rows = await container.deps.db
      .select()
      .from(proposals)
      .where(eq(proposals.orgId, DEMO_ORG_ID));
    const byStatus = (s: string) => rows.filter((p) => p.status === s).length;
    expect(byStatus('accepted')).toBe(4);
    expect(byStatus('rejected')).toBe(1);
  });

  it('processes September and climbs the trust ladder', async () => {
    await runMonth(container.deps, '2026-09', { paceMs: 0 });
    for (const bill of SEPTEMBER) {
      const { decision } = await byDataset(bill.id);
      expect({ id: bill.id, outcome: decision.outcome }).toEqual({
        id: bill.id,
        outcome: bill.expected.outcome,
      });
    }
    const view = await overview(container.deps, DEMO_ORG_ID);
    const [aug, sep] = view.ladder;
    expect(aug?.periodKey).toBe('2026-08');
    expect(sep?.periodKey).toBe('2026-09');
    expect(sep!.autonomy).toBeGreaterThan(aug!.autonomy);
  });

  it('requires two distinct approvers above the dual threshold', async () => {
    const { invoice, decision } = await byDataset('sep-16');
    expect(decision.approvalsRequired).toBe(2);
    expect(invoice.status).toBe('APPROVED');
  });

  it('is idempotent when a month is replayed', async () => {
    const again = await runMonth(container.deps, '2026-08', { paceMs: 0, withTeam: false });
    expect(again.processed).toBe(0);
  });
});

describe('live files and attacks', () => {
  it('decides the live files with the real clock', async () => {
    for (const bill of LIVE) {
      await runLiveFile(container.deps, bill.id);
      const { decision } = await byDataset(bill.id);
      expect({ id: bill.id, outcome: decision.outcome }).toEqual({
        id: bill.id,
        outcome: bill.expected.outcome,
      });
    }
  });

  it.each(ATTACKS.map((a) => [a.id, a] as const))('catches %s', async (_id, attack) => {
    const { results } = await launchAttack(container.deps, attack.id);
    for (const [index, result] of results.entries()) {
      const [row] = await container.deps.db
        .select()
        .from(decisions)
        .where(eq(decisions.invoiceId, result.invoiceId));
      const bill = attack.bills[index];
      const expected = bill?.expected.outcome ?? 'HOLD';
      expect(row?.outcome).toBe(expected);
      if (expected !== 'PAY') {
        expect(row?.results.filter((r) => r.status === 'fail').map((r) => r.id)).toContain(
          attack.caughtBy,
        );
      }
    }
  });
});

describe('payments', () => {
  it('pays every decided bill on its due date, to the registered destination', async () => {
    const rows = await container.deps.db.select().from(payments);
    const paidOrApproved = await container.deps.db
      .select()
      .from(invoices)
      .where(inArray(invoices.status, ['PAID', 'APPROVED']));
    expect(rows.length).toBeGreaterThan(20);
    // Approving a bill from someone unregistered never invents a destination.
    expect(rows.length).toBeLessThanOrEqual(paidOrApproved.length);
    const august = rows.filter((r) => r.scheduledFor.startsWith('2026-08'));
    expect(august.length).toBeGreaterThan(5);
    expect(august.every((r) => r.status === 'settled' && r.reference)).toBe(true);
    for (const r of rows) {
      const invoice = paidOrApproved.find((i) => i.id === r.invoiceId)!;
      expect(r.amountMinor).toBe(invoice.amountMinor);
      if (invoice.dueDate)
        expect(
          r.scheduledFor >= invoice.dueDate ||
            r.scheduledFor >= invoice.decidedAt!.toISOString().slice(0, 10),
        ).toBe(true);
    }
  });
});

describe('metrics', () => {
  it('keeps the attack lab out of the autonomy metrics', async () => {
    const rows = await container.deps.db
      .select()
      .from(invoices)
      .where(eq(invoices.orgId, DEMO_ORG_ID));
    const attacks = rows.filter((r) => r.source === 'attack' || r.datasetId?.startsWith('atk-'));
    // The agent's attack comes through the gateway, tagged with its lab id.
    expect(attacks.some((r) => r.source === 'agent' && r.datasetId === 'atk-11')).toBe(true);
    const view = await overview(container.deps, DEMO_ORG_ID);
    expect(attacks.length).toBeGreaterThan(0);
    expect(view.attacks).toEqual({
      launched: attacks.length,
      paid: attacks.filter((r) => r.outcome === 'PAY').length,
      stopped: attacks.filter((r) => r.outcome !== 'PAY').length,
    });
    const counted = view.ladder.reduce((sum, period) => sum + period.total, 0);
    expect(counted).toBe(rows.filter((r) => !attacks.includes(r) && r.outcome).length);
  });
});

describe('independent audit', () => {
  it('certifies zero payments outside the rules and an intact chain', async () => {
    const { report } = await runAudit(container.deps, DEMO_ORG_ID);
    expect(report.findings).toEqual([]);
    expect(report.chainIntact).toBe(true);
    expect(report.paymentsChecked).toBeGreaterThan(20);
    expect(report.approvalsChecked).toBeGreaterThan(5);
  });

  it('detects a tampered ledger entry', async () => {
    const [entry] = await container.deps.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.type, 'POLICY_VERSION_CREATED'));
    const original = entry!.payload;
    await container.deps.db
      .update(ledgerEntries)
      .set({ payload: { ...(original as object), note: 'editado a mano' } })
      .where(eq(ledgerEntries.seq, entry!.seq));
    const { report } = await runAudit(container.deps, DEMO_ORG_ID);
    expect(report.chainIntact).toBe(false);
    expect(report.findings[0]?.invariant).toBe('I8');
    await container.deps.db
      .update(ledgerEntries)
      .set({ payload: original })
      .where(eq(ledgerEntries.seq, entry!.seq));
    expect((await runAudit(container.deps, DEMO_ORG_ID)).report.chainIntact).toBe(true);
  });
});
