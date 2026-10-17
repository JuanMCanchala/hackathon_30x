import { describe, expect, it } from 'vitest';
import { evaluateLine } from '../src/evidence';
import type { ContractTerm, ExtractedLine } from '../src/types';
import { bill, hourlyTerm, hoursLine, item } from './fixtures';

const RATE = 11_500_000;
const run = (line: ExtractedLine, term: ContractTerm | null, ev: ReturnType<typeof item>[]) =>
  evaluateLine(line, 0, term, bill(), 'COP', ev, 'v1');

describe('evaluateLine', () => {
  it('hours: billed 160 h with 92 h logged in the period → partial', () => {
    const r = run(hoursLine('160'), hourlyTerm, [item({ minutes: 92 * 60 })]);
    expect(r.status).toBe('partial');
    expect(r.evidencedQuantity).toBe('92');
    expect(r.evidencedMinor).toBe(92 * RATE);
    expect(r.billedMinor).toBe(160 * RATE);
  });

  it('hours: entries outside the bill period are ignored', () => {
    const r = run(hoursLine('10'), hourlyTerm, [
      item({ id: 'a', minutes: 300, occurredAt: '2026-09-30T23:30:00-05:00' }),
      item({ id: 'b', minutes: 600, occurredAt: '2026-10-01T00:30:00-05:00' }),
      item({ id: 'c', minutes: 600, occurredAt: '2026-08-31T12:00:00Z' }),
    ]);
    expect(r.evidencedQuantity).toBe('5');
    expect(r.status).toBe('partial');
    expect(r.evidence.map((e) => e.id)).toEqual(['a']);
  });

  it('hours: logged more than billed caps at billed', () => {
    const r = run(hoursLine('10'), hourlyTerm, [item({ minutes: 900 })]);
    expect(r.status).toBe('evidenced');
    expect(r.evidencedMinor).toBe(r.billedMinor);
  });

  it('hours: half hours and no entries', () => {
    expect(run(hoursLine('92.5'), hourlyTerm, [item({ minutes: 5550 })]).evidencedQuantity).toBe(
      '92.5',
    );
    expect(run(hoursLine('5'), hourlyTerm, []).status).toBe('missing');
  });

  it('hours: unparsable quantity → missing, 0 evidenced', () => {
    const r = run({ ...hoursLine('5'), quantity: 'cinco' }, hourlyTerm, [item({ minutes: 300 })]);
    expect(r.status).toBe('missing');
    expect(r.evidencedMinor).toBe(0);
  });

  const milestone = (evidence: ContractTerm['evidence']): ContractTerm => ({
    id: 'm1',
    kind: 'milestone',
    title: 'Hito',
    unitPriceMinor: 5_000_000,
    evidence,
  });
  const mLine: ExtractedLine = {
    description: 'Hito',
    quantity: '1',
    unit: 'milestone',
    unitPrice: '50000.00',
    amount: '50000.00',
  };

  it('milestone: required PR merged → evidenced; PR open → missing', () => {
    const term = milestone({ type: 'github_pr', repo: 'altamar/pagos', number: 42 });
    const merged = item({ kind: 'pr_merged', ref: 'altamar/pagos#42', source: 'github' });
    expect(run(mLine, term, [merged]).status).toBe('evidenced');
    expect(run(mLine, term, [{ ...merged, kind: 'pr_open' }]).status).toBe('missing');
  });

  it('milestone: deliverable_pending → missing; deliverable_accepted → evidenced', () => {
    const term = milestone({ type: 'deliverable', deliverableId: 'd1' });
    const d = item({ kind: 'deliverable_accepted', ref: 'd1', source: 'entregables' });
    expect(run(mLine, term, [d]).status).toBe('evidenced');
    expect(run(mLine, term, [{ ...d, kind: 'deliverable_pending' }]).status).toBe('missing');
    expect(run(mLine, term, [d]).evidencedMinor).toBe(5_000_000);
  });

  it('retainer: evidence null → not_required, evidenced = billed', () => {
    const term: ContractTerm = { ...milestone(null), kind: 'retainer' };
    const r = run(mLine, term, []);
    expect(r.status).toBe('not_required');
    expect(r.evidencedMinor).toBe(r.billedMinor);
  });

  it('usage: reported 40000 of 52000 billed units → partial', () => {
    const term: ContractTerm = {
      id: 'u1',
      kind: 'usage',
      title: 'Uso',
      unitPriceMinor: 10,
      evidence: { type: 'usage_report', meter: 'api-calls' },
    };
    const line: ExtractedLine = {
      description: 'Llamadas',
      quantity: '52000',
      unit: 'unit',
      unitPrice: '0.10',
      amount: '5200.00',
    };
    const r = run(line, term, [
      item({ kind: 'usage_report', ref: 'api-calls', quantity: '40000', source: 'medidor' }),
    ]);
    expect(r.status).toBe('partial');
    expect(r.evidencedQuantity).toBe('40000');
    expect(r.evidencedMinor).toBe(400_000);
  });

  it('unmatched line (term null) → unmatched, evidenced 0', () => {
    const r = run(hoursLine('3'), null, [item({ minutes: 180 })]);
    expect(r.status).toBe('unmatched');
    expect(r.evidencedMinor).toBe(0);
  });

  it('hours line shows merged PRs in the period as supporting, not counted', () => {
    const pr = item({ id: 'pr', kind: 'pr_merged', ref: 'altamar/pagos#7', source: 'github' });
    const r = run(hoursLine('10'), hourlyTerm, [pr, item({ minutes: 600 })]);
    expect(r.supporting.map((e) => e.id)).toEqual(['pr']);
    expect(r.evidence.map((e) => e.id)).not.toContain('pr');
  });
});

describe('evaluateLine hardening', () => {
  const usageTerm: ContractTerm = {
    id: 'u1',
    kind: 'usage',
    title: 'Uso',
    unitPriceMinor: 10,
    evidence: { type: 'usage_report', meter: 'api-calls' },
  };
  const usageLine: ExtractedLine = {
    description: 'Llamadas',
    quantity: '100',
    unit: 'unit',
    unitPrice: '0.10',
    amount: '10.00',
  };
  const usage = (q: string, id: string) =>
    item({ id, kind: 'usage_report', ref: 'api-calls', quantity: q, source: 'medidor' });

  it('null or malformed period counts nothing for period-bound evidence', () => {
    const run2 = (b: Parameters<typeof bill>[0]) =>
      evaluateLine(hoursLine('10'), 0, hourlyTerm, bill(b), 'COP', [item({ minutes: 600 })], 'v1');
    expect(run2({ periodTo: null }).status).toBe('missing');
    expect(run2({ periodFrom: null }).evidencedMinor).toBe(0);
    expect(run2({ periodFrom: 'sept' }).status).toBe('missing');
    const u = evaluateLine(
      usageLine,
      0,
      usageTerm,
      bill({ periodTo: null }),
      'COP',
      [usage('100', 'x')],
      'v1',
    );
    expect(u.status).toBe('missing');
  });

  it('usage sums exactly and ignores malformed quantities', () => {
    const r = run(usageLine, usageTerm, [
      usage('0.1', 'a'),
      usage('0.2', 'b'),
      usage('NaN', 'c'),
      usage('1e3', 'd'),
    ]);
    expect(r.evidencedQuantity).toBe('0.3');
    expect(r.evidencedQuantity).not.toContain('NaN');
    const bad = run({ ...usageLine, quantity: 'lots' }, usageTerm, [usage('5', 'a')]);
    expect(bad.status).toBe('missing');
    expect(bad.evidencedQuantity).toBe('0');
  });

  it('duplicate evidence ids count once', () => {
    const e = item({ id: 'dup', minutes: 300 });
    const r = run(hoursLine('10'), hourlyTerm, [e, { ...e }]);
    expect(r.evidencedQuantity).toBe('5');
    expect(r.evidence).toHaveLength(1);
  });

  it('unparsable unit price → missing, 0 evidenced', () => {
    const h = run({ ...hoursLine('10'), unitPrice: null }, hourlyTerm, [item({ minutes: 600 })]);
    expect(h.status).toBe('missing');
    expect(h.evidencedMinor).toBe(0);
    const u = run({ ...usageLine, unitPrice: 'x' }, usageTerm, [usage('100', 'a')]);
    expect(u.status).toBe('missing');
    expect(u.evidencedMinor).toBe(0);
  });

  it('ticket, delivery and goods requirements', () => {
    const mk = (kind: ContractTerm['kind'], evidence: ContractTerm['evidence']): ContractTerm => ({
      id: 't',
      kind,
      title: 'T',
      unitPriceMinor: 100,
      evidence,
    });
    const line: ExtractedLine = {
      description: 'x',
      quantity: '1',
      unit: 'unit',
      unitPrice: '1.00',
      amount: '1.00',
    };
    const ticket = mk('milestone', { type: 'ticket', key: 'ALT-1' });
    expect(run(line, ticket, [item({ kind: 'ticket_closed', ref: 'ALT-1' })]).status).toBe(
      'evidenced',
    );
    expect(run(line, ticket, [item({ kind: 'ticket_open', ref: 'ALT-1' })]).status).toBe('missing');
    const goods = mk('goods', { type: 'delivery', orderId: 'O-9' });
    expect(
      run(line, goods, [item({ kind: 'delivery_confirmed', ref: 'O-9' })]).evidencedMinor,
    ).toBe(100);
    expect(run(line, goods, [item({ kind: 'delivery_confirmed', ref: 'O-8' })]).status).toBe(
      'missing',
    );
  });

  it('evidence of another vendor is ignored', () => {
    const r = run(hoursLine('10'), hourlyTerm, [item({ vendorId: 'other', minutes: 600 })]);
    expect(r.status).toBe('missing');
  });
});
