import {
  activeContract,
  checkInvariants,
  ExtractedBillSchema,
  parseDecimalToMinor,
  type Currency,
  type Outcome,
} from '@recibido/domain';
import { sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILLS,
  COMPANY,
  CONTRACTS,
  EVIDENCE,
  filesDir,
  LIVE_PR,
  RETURNING_VENDOR_ID,
  SCRIPT,
  VENDORS,
  type BillSpec,
} from '../src';
import { replayScript } from './replay';

const bill = (id: string): BillSpec => {
  const found = BILLS.find((b) => b.id === id);
  if (!found) throw new Error(`missing bill ${id}`);
  return found;
};
const steps = [...SCRIPT.septiembre, ...SCRIPT.octubre];

describe('dataset shape', () => {
  it('has unique ids', () => {
    for (const list of [BILLS, VENDORS, CONTRACTS, EVIDENCE]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const terms = CONTRACTS.flatMap((c) => c.terms.map((t) => t.id));
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('has 14 vendors: 12 contractors in CO/MX/BR and 2 US SaaS', () => {
    expect(VENDORS).toHaveLength(14);
    expect(VENDORS.filter((v) => v.country === 'US')).toHaveLength(2);
    for (const c of ['CO', 'MX', 'BR'] as const)
      expect(VENDORS.some((v) => v.country === c)).toBe(true);
  });

  it('references only existing vendors, contracts and terms', () => {
    const vendorIds = new Set(VENDORS.map((v) => v.id));
    for (const c of CONTRACTS) expect(vendorIds.has(c.vendorId)).toBe(true);
    for (const e of EVIDENCE) expect(vendorIds.has(e.vendorId)).toBe(true);
    for (const b of BILLS) if (b.vendorId) expect(vendorIds.has(b.vendorId), b.id).toBe(true);
    expect(vendorIds.has(RETURNING_VENDOR_ID)).toBe(true);
    const live = CONTRACTS.find((c) => c.id === LIVE_PR.contractId);
    expect(live?.vendorId).toBe(LIVE_PR.vendorId);
    expect(live?.terms.find((t) => t.id === LIVE_PR.termId)?.evidence).toEqual({
      type: 'github_pr',
      repo: LIVE_PR.repo,
      number: LIVE_PR.number,
    });
  });

  it('never has two active contracts of a vendor on the same day', () => {
    for (const v of VENDORS) {
      const mine = CONTRACTS.filter((c) => c.vendorId === v.id);
      for (const a of mine)
        for (const b of mine) {
          if (a === b) continue;
          const disjoint =
            (a.validTo !== null && a.validTo < b.validFrom) ||
            (b.validTo !== null && b.validTo < a.validFrom);
          expect(disjoint, `${a.id} / ${b.id}`).toBe(true);
        }
    }
  });

  it('has between 40 and 60 bills, about half per month', () => {
    expect(BILLS.length).toBeGreaterThanOrEqual(40);
    expect(BILLS.length).toBeLessThanOrEqual(60);
    for (const m of ['septiembre', 'octubre'] as const)
      expect(BILLS.filter((b) => b.month === m).length).toBeGreaterThanOrEqual(20);
  });

  it('declares a file per bill under its month, with the extension of its channel', () => {
    const ext = { pdf: 'pdf', portal: 'pdf', email: 'eml', chat: 'txt' };
    for (const b of BILLS) {
      expect(b.file.startsWith(`${b.month}/${b.id}-`), b.id).toBe(true);
      expect(b.file.endsWith(`.${ext[b.channel]}`), b.id).toBe(true);
      expect(b.body !== undefined, b.id).toBe(b.channel === 'email' || b.channel === 'chat');
    }
    expect(new Set(BILLS.map((b) => b.file)).size).toBe(BILLS.length);
  });

  it('has truth readings that parse and lines that add up (except the "no cuadra" bills)', () => {
    for (const b of BILLS) {
      expect(() => ExtractedBillSchema.parse(b.truth), b.id).not.toThrow();
      const cur = b.truth.currency as Currency;
      const sum = b.truth.lines.reduce((s, l) => s + parseDecimalToMinor(l.amount, cur)!, 0);
      const total = parseDecimalToMinor(b.truth.total, cur);
      if (b.story.includes('no cuadra')) expect(total, b.id).not.toBe(sum);
      else expect(total, b.id).toBe(sum);
    }
  });

  it('has one match per line, each to a term of the active contract (or null by design)', () => {
    for (const b of BILLS) {
      expect(b.truthMatches.map((m) => m.lineIndex)).toEqual(b.truth.lines.map((_, i) => i));
      const vendor = VENDORS.find((v) => v.id === b.vendorId);
      const contract = vendor ? activeContract(vendor, CONTRACTS, b.truth.issueDate) : null;
      if (b.vendorId) expect(contract, b.id).not.toBeNull();
      for (const m of b.truthMatches) {
        expect(m.confidence).toBe(1);
        if (m.termId !== null)
          expect(
            contract?.terms.some((t) => t.id === m.termId),
            `${b.id} ${m.termId}`,
          ).toBe(true);
      }
    }
  });

  it('reads every field with confidence 1 except the bills built to be ambiguous', () => {
    for (const b of BILLS) {
      const low = Object.values(b.truth.confidence).some((c) => c < 1);
      expect(low, b.id).toBe(b.story.includes('ambiguo'));
    }
  });

  it('orders the script in time and ends each month with a clock step', () => {
    const times = steps.map((s) => Date.parse(s.at));
    for (const t of times) expect(Number.isNaN(t)).toBe(false);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(SCRIPT.septiembre.at(-1)).toMatchObject({
      type: 'clock',
      to: '2026-10-01T08:00:00-05:00',
    });
    expect(SCRIPT.octubre.at(-1)).toMatchObject({
      type: 'clock',
      to: '2026-11-10T09:00:00-05:00',
    });
    for (const s of steps) expect(s.at.endsWith('-05:00'), s.at).toBe(true);
  });

  it('puts every bill in exactly one bill step or vendor reply, in its own month', () => {
    for (const m of ['septiembre', 'octubre'] as const) {
      const ids = SCRIPT[m].flatMap((s) =>
        s.type === 'bill'
          ? [s.billId]
          : s.type === 'vendor_reply' && s.replyBillId
            ? [s.replyBillId]
            : [],
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect([...ids].sort()).toEqual(
        BILLS.filter((b) => b.month === m)
          .map((b) => b.id)
          .sort(),
      );
    }
    for (const s of steps) {
      if (s.type !== 'vendor_reply') continue;
      if (s.replyBillId) expect(bill(s.replyBillId).revisionOfBillId).toBe(s.billId);
    }
    for (const b of BILLS)
      if (b.revisionOfBillId) {
        expect(b.channel).toBe('portal');
        expect(b.vendorId).toBe(bill(b.revisionOfBillId).vendorId);
      }
  });

  it('covers every outcome at least once', () => {
    const outcomes: Outcome[] = ['PAY', 'PAY_PART', 'ASK_VENDOR', 'ESCALATE', 'HOLD'];
    for (const o of outcomes)
      expect(
        BILLS.some((b) => b.expected.first === o),
        o,
      ).toBe(true);
  });

  it('has the October cases the demo needs', () => {
    const want: Record<string, BillSpec['expected']> = {
      'oct-01': { first: 'PAY', final: 'PAID', resolvedBy: 'agent' },
      'oct-02': { first: 'PAY', final: 'PAID', resolvedBy: 'agent' },
      'oct-03': { first: 'PAY_PART', final: 'PAID', resolvedBy: 'vendor' },
      'oct-03-r1': { first: 'PAY', final: 'PAID', resolvedBy: 'vendor' },
      'oct-04': { first: 'ASK_VENDOR', final: 'PAID', resolvedBy: 'vendor' },
      'oct-05': { first: 'ASK_VENDOR', final: 'PAID', resolvedBy: 'vendor' },
      'oct-06': { first: 'ESCALATE', final: 'APPROVED', resolvedBy: 'person' },
      'oct-07': { first: 'HOLD', final: 'HELD', resolvedBy: 'agent' },
    };
    for (const [id, expected] of Object.entries(want))
      expect(bill(id).expected, id).toEqual(expected);
    expect(bill('oct-01').vendorId).toBe('trazo-cloud');
    expect(bill('oct-02').vendorId).toBe('julian-restrepo');
    expect(bill('oct-03').vendorId).toBe('daniela-ospina');
    expect(bill('oct-04').vendorId).toBe('estudio-ceiba');
    expect(bill('oct-05').vendorId).toBe('andres-villasenor');
    expect(bill('oct-06').vendorId).toBe('thiago-moreira');
    expect(bill('oct-07').truth).toEqual(bill('oct-02').truth);
    expect(bill('oct-03-r1').truth.invoiceNumber).toBe(bill('oct-03').truth.invoiceNumber);
    expect(bill('oct-03-r1').truth.revisionOf).toBe(bill('oct-03').truth.invoiceNumber);
    expect(bill('oct-06').body).toContain('98877-6655');
    expect(LIVE_PR).toMatchObject({ repo: 'altamar-labs/app-movil', number: 3 });
    const kinds = ['usage', 'goods', 'retainer'];
    for (const kind of kinds)
      expect(
        BILLS.some(
          (b) =>
            b.month === 'octubre' &&
            b.expected.first === 'PAY' &&
            CONTRACTS.find((c) => c.vendorId === b.vendorId && c.type === kind),
        ),
        kind,
      ).toBe(true);
  });

  it('keeps the vendors required by the brief', () => {
    const want: [string, string, string][] = [
      ['daniela-ospina', 'CO', 'hourly'],
      ['julian-restrepo', 'CO', 'hourly'],
      ['estudio-ceiba', 'CO', 'milestone'],
      ['andres-villasenor', 'MX', 'milestone'],
      ['thiago-moreira', 'BR', 'hourly'],
      ['trazo-cloud', 'US', 'retainer'],
    ];
    for (const [id, country, type] of want) {
      expect(VENDORS.find((v) => v.id === id)?.country, id).toBe(country);
      expect(
        CONTRACTS.some((c) => c.vendorId === id && c.type === type),
        id,
      ).toBe(true);
    }
    expect(CONTRACTS.find((c) => c.vendorId === 'daniela-ospina')?.allowPartial).toBe(true);
    expect(BILLS.some((b) => b.vendorId === null)).toBe(true);
  });

  it('does not reuse Mandato names', () => {
    const banned = [
      'Andes Labs',
      'Valentina',
      'Mateo',
      'Camila',
      'Tomás',
      'Sebastián',
      'Rafael',
      'Lucía',
      'Laura',
      'Martín',
      'Sofía',
    ];
    const names = [
      COMPANY.name,
      ...COMPANY.people.map((p) => p.name),
      ...VENDORS.flatMap((v) => [v.name, v.legalName, v.contactName]),
      ...BILLS.map((b) => b.truth.vendorName ?? ''),
    ].join(' | ');
    for (const n of banned) expect(names.includes(n), n).toBe(false);
  });
});

describe('engine replay (acceptance gate of the dataset)', () => {
  const result = replayScript(steps);

  it('decides every bill as labeled, first and final', () => {
    const wrong = BILLS.flatMap((b) => {
      const got = result.bills[b.id];
      if (!got) return [`${b.id}: never decided`];
      return got.first === b.expected.first && got.final === b.expected.final
        ? []
        : [
            `${b.id}: expected ${b.expected.first}→${b.expected.final}, got ${got.first}→${got.final} (${got.decisions
              .at(-1)!
              .checks.filter((c) => c.status !== 'pass')
              .map((c) => `${c.id}: ${c.detail}`)
              .join(' | ')})`,
          ];
    });
    expect(wrong).toEqual([]);
  });

  it('never breaks an invariant', () => {
    expect(checkInvariants(result.checker)).toEqual([]);
  });

  it('pays the corrected 92 h bill nothing more and pays the escalated Pix case to the registered key', () => {
    const { payments } = result.checker;
    expect(payments.filter((p) => p.billId === 'oct-03-r1')).toEqual([]);
    expect(result.bills['oct-03-r1']!.decisions[0]!.payNowMinor).toBe(0);
    expect(payments.filter((p) => p.billId === 'oct-03').map((p) => p.amountMinor)).toEqual([
      1_196_000_000,
    ]);
    const thiago = payments.filter((p) => p.billId === 'oct-06');
    expect(thiago).toHaveLength(1);
    expect(thiago[0]).toMatchObject({
      decidedBy: 'person',
      destination: VENDORS.find((v) => v.id === 'thiago-moreira')!.payout.destination,
    });
  });

  it('sends every scheduled payment by the end of October', () => {
    expect(result.checker.payments.every((p) => p.status === 'sent')).toBe(true);
  });

  it('exceeds the automatic payment limit only in the case built for it', () => {
    const over = BILLS.filter((b) =>
      result.bills[b.id]!.decisions.some(
        (d) => d.checks.find((c) => c.id === 'policy.limit')?.status === 'fail',
      ),
    ).map((b) => b.id);
    expect(over).toEqual(['oct-14']);
    // a duplicate re-bills paid work, so it also overflows the cap; it is held for that reason
    const overCap = BILLS.filter(
      (b) =>
        b.expected.first !== 'HOLD' &&
        result.bills[b.id]!.decisions.some(
          (d) => d.checks.find((c) => c.id === 'terms.cap')?.status === 'fail',
        ),
    ).map((b) => b.id);
    expect(overCap).toEqual(['oct-11']);
  });
});

describe('filesDir', () => {
  it('points at packages/dataset/files', () => {
    expect(filesDir().split(sep).join('/')).toMatch(/packages\/dataset\/files$/);
  });
});
