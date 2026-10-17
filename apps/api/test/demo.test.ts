import { BILLS, SCRIPT, VENDORS } from '@recibido/dataset';
import type { Payment } from '@recibido/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentText as datasetDocumentText } from '../../../packages/dataset/test/documents';
import { replayScript } from '../../../packages/dataset/test/replay';
import { bills, orgState } from '../src/db/schema';
import { DemoService } from '../src/services/demo';
import { reconciliationView } from '../src/services/reconciliation';
import { allPayments } from '../src/services/state';
import { billList, overview, paymentsView } from '../src/services/views';
import { setup } from './helpers';

type Env = Awaited<ReturnType<typeof setup>>;
let c: Env;
let demo: DemoService;
const texts = new Map<string, string>();

beforeAll(async () => {
  for (const spec of BILLS) texts.set(spec.id, await datasetDocumentText(spec));
  c = await setup();
  demo = new DemoService(c, 0);
});
afterAll(() => c?.dispose());

const oracle = (steps: Parameters<typeof replayScript>[0]) =>
  replayScript(steps, { documentText: (s) => texts.get(s.id) ?? null });

async function snapshot() {
  const list = await billList(c.deps);
  const label = new Map(list.map((b) => [b.id, b.datasetId]));
  return {
    clock: await c.clock.now(),
    bills: list.map((b) => [b.datasetId, b.status]),
    payments: (await allPayments(c.db)).map((p) => [label.get(p.billId), p.amountMinor, p.status]),
  };
}

describe('the guided demo', () => {
  let october1: Awaited<ReturnType<typeof snapshot>>;

  it('resets to October 1 with September lived through the services', async () => {
    await demo.reset();
    const tour = await demo.tourState();
    expect(tour.phase).toBe('september');
    expect(tour.now).toBe('2026-10-01T08:00:00-05:00');
    expect(tour.actions.filter((a) => a.available).map((a) => a.id)).toEqual(['arrive-october']);
    await expect(demo.act('close-october')).rejects.toMatchObject({ status: 409 });
    october1 = await snapshot();
    expect(october1.bills.length).toBe(BILLS.filter((b) => b.month === 'septiembre').length);
  });

  it('walks every tour action and ends where the labels and the oracle say', async () => {
    await demo.act('arrive-october');
    await demo.idle();
    expect((await demo.tourState()).phase).toBe('october');
    await demo.act('reply-daniela');
    await expect(demo.act('reply-daniela')).rejects.toMatchObject({ status: 409 });
    await demo.act('accept-brand-kit');
    expect(await demo.act('merge-pr')).toMatchObject({ mode: 'simulated' });
    await demo.act('close-october');
    expect((await demo.tourState()).phase).toBe('closed');
    expect(demo.problems).toEqual([]);

    const view = await overview(c.deps);
    expect(view.violations).toEqual([]);
    expect(view.scorecard.improperPayments).toBe(0);

    const all = await c.db.select().from(bills);
    for (const spec of BILLS.filter((b) => b.month === 'octubre')) {
      const bill = all.find((b) => b.datasetId === spec.id);
      const head = all.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(bill!.id));
      expect({ id: spec.id, final: head?.status }).toEqual({
        id: spec.id,
        final: spec.expected.final,
      });
    }

    // the same money to the same places as the in-memory replay of exactly these steps…
    const label = new Map(all.map((b) => [b.id, b.datasetId]));
    const strip = (p: Payment) => [
      label.get(p.billId) ?? p.billId,
      p.amountMinor,
      p.destination,
      p.decidedBy,
      p.scheduledFor,
      p.executedAt,
    ];
    const stored = (await allPayments(c.db)).map(strip);
    expect(stored).toEqual(oracle(demo.log).checker.payments.map(strip));
    // …and as the script in its own order: the tour's reordering moves no money
    const sorted = (xs: unknown[][]) => xs.map((x) => JSON.stringify(x)).sort();
    expect(sorted(stored)).toEqual(
      sorted(oracle([...SCRIPT.septiembre, ...SCRIPT.octubre]).checker.payments.map(strip)),
    );

    const recon = await reconciliationView(c.deps);
    expect(recon.totals.matchedFx).toBeGreaterThanOrEqual(1);
    expect(recon.totals.returned).toBe(1);
    expect(recon.totals.fees).toBeGreaterThanOrEqual(1);
    expect(recon.totals.unmatched).toBe(1);
    expect(recon.rows.find((r) => r.status === 'unmatched')?.line.description).toBe(
      'VISA *CUMBRE CLOUD',
    );
    const returned = recon.rows.find((r) => r.status === 'returned')!;
    expect(returned.bill?.datasetId).toBe('oct-12-r1');
    expect(returned.bill?.status).toBe('PAID');
    const matched = recon.rows.find((r) => r.status === 'matched_fx' && r.evidence.length > 0)!;
    expect(matched.contract).not.toBeNull();
    expect(matched.payment).not.toHaveProperty('destination');
  });

  it('never exposes a payout destination in the read views', async () => {
    const body = JSON.stringify([await paymentsView(c.deps), await reconciliationView(c.deps)]);
    for (const v of VENDORS) expect(body).not.toContain(`"${v.payout.destination}"`);
    const refs = (await paymentsView(c.deps)).map((p) => Number(p.reference.slice(4)));
    expect(refs.length).toBeGreaterThan(1);
    refs.slice(1).forEach((r, i) => expect(r).toBeGreaterThan(refs[i]!));
  });

  it('closing October before the bills arrived records problems instead of aborting', async () => {
    await demo.reset();
    await c.db.update(orgState).set({ phase: 'october' });
    await demo.act('close-october');
    expect((await demo.tourState()).phase).toBe('closed');
    expect(demo.problems.some((p) => p.includes('todavía no llegó'))).toBe(true);
  });

  it('a second reset restores the October 1 state', async () => {
    await demo.reset();
    expect(await snapshot()).toEqual(october1);
    expect((await reconciliationView(c.deps)).rows.every((r) => r.line.date < '2026-10-02')).toBe(
      true,
    );
  });
});
