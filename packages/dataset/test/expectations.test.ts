import { describe, expect, it } from 'vitest';
import { ATTACKS, AUGUST, LIVE, SEPTEMBER, ALL_BILLS } from '../src';
import { Replay } from './replay';

function failingOf(replay: Replay, id: string) {
  const r = replay.results.get(id);
  if (!r) throw new Error(`no result for ${id}`);
  return r.decision.results
    .filter((x) => x.status === 'fail')
    .map((x) => x.id)
    .sort();
}

describe('dataset expectations (engine with perfect reading)', () => {
  const replay = new Replay();
  replay.run([...AUGUST, ...SEPTEMBER]);

  it.each([...AUGUST, ...SEPTEMBER].map((b) => [b.id, b] as const))('%s', (id, bill) => {
    const result = replay.results.get(id)!;
    expect(result.decision.outcome, result.decision.summary).toBe(bill.expected.outcome);
    expect(failingOf(replay, id)).toEqual([...bill.expected.failing].sort());
    if (bill.expected.approvalsRequired !== undefined) {
      expect(result.decision.approvalsRequired).toBe(bill.expected.approvalsRequired);
    }
  });

  it('climbs the trust ladder from August to September', () => {
    const autonomy = (bills: typeof AUGUST) =>
      bills.filter((b) => replay.results.get(b.id)!.decision.outcome !== 'ESCALATE').length /
      bills.length;
    expect(autonomy(SEPTEMBER)).toBeGreaterThan(autonomy(AUGUST));
  });

  it('learned from the approvals it was allowed to learn from', () => {
    expect(replay.proposals.get('ago-02')?.kind).toBe('update_mandate');
    expect(replay.proposals.get('ago-09')?.kind).toBe('update_mandate');
    expect(replay.proposals.get('ago-11')?.kind).toBe('register_payee_and_mandate');
    expect(replay.proposals.get('ago-17')?.kind).toBe('create_mandate');
    expect(replay.proposals.get('sep-04')).toBeNull(); // destination changes are never learned
    expect(replay.proposals.get('sep-16')).toBeNull(); // budget overruns are never learned
  });

  describe('live files and attacks (October, after both months)', () => {
    const now = (i: number) =>
      `2026-10-16T${String(11 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00-05:00`;
    LIVE.forEach((bill, i) => replay.decideBill(bill, now(i)));
    for (const attack of ATTACKS) {
      attack.bills.forEach((bill) => replay.decideBill(bill));
    }

    it.each(LIVE.map((b) => [b.id, b] as const))('%s', (id, bill) => {
      expect(replay.results.get(id)!.decision.outcome).toBe(bill.expected.outcome);
      expect(failingOf(replay, id)).toEqual([...bill.expected.failing].sort());
    });

    it.each(ATTACKS.flatMap((a) => a.bills.map((b) => [b.id, a, b] as const)))(
      '%s is caught',
      (id, attack, bill) => {
        const result = replay.results.get(id)!;
        expect(result.decision.outcome, result.decision.summary).toBe(bill.expected.outcome);
        expect(failingOf(replay, id)).toEqual([...bill.expected.failing].sort());
        if (bill.expected.outcome !== 'PAY')
          expect(failingOf(replay, id)).toContain(attack.caughtBy);
      },
    );
  });

  it('uses unique ids and file names', () => {
    expect(new Set(ALL_BILLS.map((b) => b.id)).size).toBe(ALL_BILLS.length);
    expect(new Set(ALL_BILLS.map((b) => b.file)).size).toBe(ALL_BILLS.length);
  });
});
