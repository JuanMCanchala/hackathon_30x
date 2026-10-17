import { describe, expect, it } from 'vitest';
import { signalsFor, type SignalBill } from '../src/signals';

const bill = (
  ref: string,
  receivedOn: string,
  amountMinor: number,
  extra: Partial<SignalBill> = {},
) =>
  ({
    ref,
    receivedOn,
    amountMinor,
    currency: 'MXN',
    usdCents: Math.round(amountMinor / 18.5),
    accepted: true,
    rejected: false,
    ...extra,
  }) satisfies SignalBill;

describe('the anomaly radar', () => {
  const history = [bill('A', '2026-08-03', 14_800_000), bill('B', '2026-09-04', 14_800_000)];

  it('says nothing about a bill like the usual ones', () => {
    expect(signalsFor(bill('C', '2026-10-05', 14_800_000), history)).toEqual([]);
  });

  it('flags an amount far above what is usually paid', () => {
    const [signal] = signalsFor(bill('C', '2026-10-05', 37_000_000), history);
    expect(signal).toMatchObject({ kind: 'amount_jump', level: 'watch' });
    expect(signal?.title).toBe('Cobra 150 % más de lo habitual');
  });

  it('flags a second bill a few days after the last', () => {
    const kinds = signalsFor(bill('C', '2026-09-09', 14_800_000), history).map((s) => s.kind);
    expect(kinds).toContain('quick_repeat');
  });

  it('notices a bill off its usual day, and a large first bill', () => {
    expect(signalsFor(bill('C', '2026-10-24', 14_800_000), history).map((s) => s.kind)).toEqual([
      'off_cycle',
    ]);
    expect(signalsFor(bill('C', '2026-10-24', 14_800_000), []).map((s) => s.kind)).toEqual([
      'large_first',
    ]);
  });

  it('ignores rejected bills when looking for repeats', () => {
    const rejected = [bill('A', '2026-09-01', 14_800_000, { rejected: true, accepted: false })];
    expect(signalsFor(bill('C', '2026-09-03', 14_800_000), rejected)).toEqual([]);
  });
});
