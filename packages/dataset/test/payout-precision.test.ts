/**
 * vendor.payout against what the documents really say: the text layer of each rendered PDF, the
 * e-mail body plus its attached PDF, the chat transcript. Only the bills designed to carry a
 * foreign destination may fail it.
 */
import type { CheckResult } from '@recibido/domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { BILLS, SCRIPT } from '../src';
import { documentText } from './documents';
import { replayScript, type ReplayResult } from './replay';

/** sep-05 asks to pay a new bank account; oct-06 announces a new Pix key. */
const DESIGNED_TO_FAIL = ['sep-05', 'oct-06'];

const payout = (checks: CheckResult[]) => checks.find((c) => c.id === 'vendor.payout')!;

describe('vendor.payout on the rendered documents', () => {
  let result: ReplayResult;
  beforeAll(async () => {
    const texts = new Map<string, string>();
    for (const b of BILLS) texts.set(b.id, await documentText(b));
    result = replayScript([...SCRIPT.septiembre, ...SCRIPT.octubre], {
      documentText: (spec) => texts.get(spec.id)!,
    });
  });

  it('passes every registered vendor bill not designed to fail it', () => {
    const wrong = BILLS.filter((b) => b.vendorId && !DESIGNED_TO_FAIL.includes(b.id)).flatMap((b) =>
      result.bills[b.id]!.decisions.map((d) => payout(d.checks)).flatMap((c) =>
        c.status === 'pass' ? [] : [`${b.id}: ${c.detail}`],
      ),
    );
    expect(wrong).toEqual([]);
  });

  it('still fails the bills that ask to pay somewhere else', () => {
    for (const id of DESIGNED_TO_FAIL) {
      const first = result.bills[id]!.decisions[0]!;
      expect(payout(first.checks).status, id).toBe('fail');
      expect(first.outcome, id).toBe('ESCALATE');
    }
  });

  it('names the Pix key oct-06 asks for', () => {
    const detail = payout(result.bills['oct-06']!.decisions[0]!.checks).detail;
    expect(detail).toContain('5511988776655');
  });

  it('keeps every labeled first and final outcome', () => {
    const wrong = BILLS.flatMap((b) => {
      const got = result.bills[b.id]!;
      return got.first === b.expected.first && got.final === b.expected.final
        ? []
        : [
            `${b.id}: expected ${b.expected.first}→${b.expected.final}, got ${got.first}→${got.final}`,
          ];
    });
    expect(wrong).toEqual([]);
  });
});
