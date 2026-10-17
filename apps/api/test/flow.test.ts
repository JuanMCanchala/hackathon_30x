import { findBill, SCRIPT, SCRIPTED_EVIDENCE, VENDORS } from '@recibido/dataset';
import type { ExtractedBill, LineMatch, Payment } from '@recibido/domain';
import { afterEach, describe, expect, it } from 'vitest';
import type { Matcher } from '../src/reading/matcher';
import type { Reader } from '../src/reading/reader';
import { allEvidence, allPayments } from '../src/services/state';
import { documentText as datasetDocumentText } from '../../../packages/dataset/test/documents';
import { replayScript } from '../../../packages/dataset/test/replay';
import { bills } from '../src/db/schema';
import { withOrgLock } from '../src/services/lock';
import { billOf, decisionsOf, ingest, paymentsOf, runSteps, setup } from './helpers';

type Env = Awaited<ReturnType<typeof setup>>;
let c: Env;
afterEach(async () => {
  await c?.dispose();
  c = undefined as unknown as Env; // each test opens its own database
});

const vendor = (id: string) => VENDORS.find((v) => v.id === id)!;

describe('evaluating bills', () => {
  it('oct-02 pays and schedules a Bre-B payment to the registered destination', async () => {
    c = await setup();
    const { decision } = await ingest(c, 'oct-02');
    expect(decision?.outcome).toBe('PAY');
    const bill = await billOf(c, 'oct-02');
    expect(bill.status).toBe('PAID');
    const [payment, ...rest] = await paymentsOf(c, [bill.id]);
    expect(rest).toHaveLength(0);
    expect(payment).toMatchObject({
      rail: 'bre-b',
      currency: 'COP',
      decidedBy: 'agent',
      status: 'scheduled',
      destination: vendor('julian-restrepo').payout.destination,
      amountMinor: decision!.billedMinor,
      reference: 'RCB-0001',
    });
    expect(payment!.decisionId).toBe(`${bill.id}:1`);
  });

  it('the same document twice creates one bill and one decision', async () => {
    c = await setup();
    const first = await ingest(c, 'oct-02');
    const again = await ingest(c, 'oct-02');
    expect(again).toMatchObject({ billId: first.billId, duplicateDocument: true });
    expect(await decisionsOf(c, first.billId)).toHaveLength(1);
    expect(await allPayments(c.db)).toHaveLength(1);
  });

  it('oct-07 holds the forwarded copy', async () => {
    c = await setup();
    await ingest(c, 'oct-02');
    const { decision } = await ingest(c, 'oct-07');
    expect(decision?.outcome).toBe('HOLD');
    expect((await billOf(c, 'oct-07')).status).toBe('HELD');
    expect(await allPayments(c.db)).toHaveLength(1);
  });

  it('an unreadable document escalates', async () => {
    c = await setup({ READER: 'auto', LLM_PROVIDER: 'none' });
    const { decision } = await ingest(c, 'oct-02');
    expect(decision?.outcome).toBe('ESCALATE');
    expect(decision?.checks.find((k) => k.id === 'reading.available')?.status).toBe('fail');
    expect(await allPayments(c.db)).toHaveLength(0);
  });
});

describe('people', () => {
  it('a person approving oct-06 pays the registered destination, not the one in the e-mail', async () => {
    c = await setup();
    const { decision, billId } = await ingest(c, 'oct-06');
    expect(decision?.outcome).toBe('ESCALATE');
    await c.clock.set('2026-10-05T12:00:00-05:00');
    const { status, payment } = await c.resolveEscalation(billId, {
      action: 'approve',
      actor: 'Diego Navarro',
      note: 'Thiago confirmó por llamada.',
    });
    expect(status).toBe('APPROVED');
    expect(payment).toMatchObject({
      decidedBy: 'person',
      decisionId: null,
      amountMinor: decision!.billedMinor,
      destination: vendor('thiago-moreira').payout.destination,
    });
    expect(payment!.destination).not.toContain('98877');
    await expect(
      c.resolveEscalation(billId, { action: 'approve', actor: 'Diego Navarro', note: '' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await allPayments(c.db)).toHaveLength(1);
  });

  it('a rejected bill pays nothing', async () => {
    c = await setup();
    const { billId } = await ingest(c, 'oct-06');
    const { status, payment } = await c.resolveEscalation(billId, {
      action: 'reject',
      actor: 'Diego Navarro',
      note: 'No.',
    });
    expect([status, payment]).toEqual(['REJECTED', null]);
  });
});

describe('evidence', () => {
  it('imports time entries from a CSV, labeled csv, and rejects a bad row', async () => {
    c = await setup();
    const { imported, vendorIds } = await c.importTimeEntriesCsv(
      'fecha,proveedor,proyecto,minutos,descripcion\n2026-10-01,daniela-ospina,api-pagos,240,"Revisión, ajustes"\n',
    );
    expect([imported, vendorIds]).toEqual([1, ['daniela-ospina']]);
    const item = (await allEvidence(c.db)).find((e) => e.origin === 'csv');
    expect(item).toMatchObject({ kind: 'time_entry', minutes: 240, title: 'Revisión, ajustes' });
    await expect(
      c.importTimeEntriesCsv('fecha,proveedor,proyecto,minutos,descripcion\nayer,x,y,1,z'),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('the organization lock', () => {
  it('runs one critical section at a time and survives a failure', async () => {
    const log: string[] = [];
    const section = (name: string, fail = false) =>
      withOrgLock(async () => {
        log.push(`${name}+`);
        await new Promise((r) => setTimeout(r, 5));
        log.push(`${name}-`);
        if (fail) throw new Error(name);
      });
    const results = await Promise.allSettled([section('a'), section('b', true), section('c')]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(log).toEqual(['a+', 'a-', 'b+', 'b-', 'c+', 'c-']);
  });

  it('two bills processed concurrently cannot both pass the monthly cap', async () => {
    // Andrés' cap is MXN 100.000 a month: M2 (74.000) or M3 (85.000) fits, both together do not.
    const base = findBill('oct-05').truth;
    const milestone = (n: 2 | 3, invoice: string): ExtractedBill => {
      const amount = n === 2 ? '74000.00' : '85000.00';
      return {
        ...structuredClone(base),
        invoiceNumber: invoice,
        total: amount,
        lines: [
          {
            description:
              n === 2 ? 'Hito M2: pagos dentro de la app' : 'Hito M3: notificaciones push',
            quantity: '1',
            unit: 'milestone',
            unitPrice: amount,
            amount,
          },
        ],
      };
    };
    const readings: Record<string, ExtractedBill> = {
      'cap-a.txt': milestone(2, 'AV-CAP-1'),
      'cap-b.txt': milestone(3, 'AV-CAP-2'),
    };
    const reader: Reader = {
      read: async (doc) => ({
        reading: structuredClone(readings[doc.filename]!),
        error: null,
        meta: { provider: 'test', model: null, cacheHit: false, latencyMs: 0 },
      }),
    };
    const matcher: Matcher = {
      match: async ({ lines }) => ({
        matches: lines.map((l, i): LineMatch => ({
          lineIndex: i,
          termId: l.description.includes('M2') ? 'villasenor-m2' : 'villasenor-m3',
          confidence: 1,
          reason: 'test',
        })),
        error: null,
        meta: { provider: 'test', model: null, cacheHit: false, latencyMs: 0 },
      }),
    };
    c = await setup({}, { reader, matcher });
    await c.upsertEvidence([SCRIPTED_EVIDENCE.andresPrMerged]);
    await c.clock.set('2026-10-03T09:00:00-05:00');
    const at = '2026-10-03T09:00:00-05:00';
    const results = await Promise.all(
      ['cap-a.txt', 'cap-b.txt'].map((filename) =>
        c.ingestDocument({ bytes: Buffer.from(`Factura ${filename}`), filename, receivedAt: at }),
      ),
    );
    const outcomes = results.map((r) => r.decision?.outcome);
    expect(outcomes).toContain('PAY');
    expect(outcomes.filter((o) => o === 'PAY')).toHaveLength(1);
    expect(await allPayments(c.db)).toHaveLength(1);
    const blocked = results.find((r) => r.decision?.outcome !== 'PAY')!.decision!;
    expect(blocked.checks.find((k) => k.id === 'terms.cap')?.status).toBe('fail');
  });
});

describe('the October demo through the services', () => {
  // the demo-critical bills, with every October event that moves them
  const IDS = ['oct-02', 'oct-03', 'oct-03-r1', 'oct-04', 'oct-05', 'oct-06', 'oct-07'];
  const VENDOR_IDS = new Set(IDS.map((id) => findBill(id).vendorId));
  const steps = SCRIPT.octubre.filter((s) =>
    s.type === 'bill' || s.type === 'human'
      ? IDS.includes(s.billId)
      : s.type === 'vendor_reply'
        ? IDS.includes(s.billId)
        : s.type === 'evidence' && VENDOR_IDS.has(s.item.vendorId),
  );

  it('ends each case where the in-memory replay of the same steps ends it', async () => {
    const texts = new Map<string, string>();
    for (const id of IDS) texts.set(id, await datasetDocumentText(findBill(id)));
    const oracle = replayScript(steps, { documentText: (s) => texts.get(s.id) ?? null });

    c = await setup();
    await runSteps(c, steps);
    const all = await c.db.select().from(bills);
    for (const id of IDS) {
      const bill = all.find((b) => b.datasetId === id)!;
      const head = all.find((b) => b.status !== 'SUPERSEDED' && b.chain.includes(bill.id))!;
      const [first] = await decisionsOf(c, bill.id);
      expect({ id, first: first?.outcome, final: head.status }).toEqual({
        id,
        first: oracle.bills[id]!.first,
        final: oracle.bills[id]!.final,
      });
    }
    // the same money, to the same places
    const strip = (p: Payment) => [p.billId, p.amountMinor, p.destination, p.decidedBy];
    const label = new Map(all.map((b) => [b.id, b.datasetId]));
    expect(
      (await allPayments(c.db)).map((p) => strip({ ...p, billId: label.get(p.billId)! })),
    ).toEqual(oracle.checker.payments.map(strip));
  });
});
