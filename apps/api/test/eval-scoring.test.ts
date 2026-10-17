import { findBill } from '@recibido/dataset';
import { describe, expect, it } from 'vitest';
import { readingErrors } from '../src/scripts/reading-fields';
import { resolverOf } from '../src/scripts/resolution';

describe('who resolved a case', () => {
  const base = { humanAction: false, vendorMessage: false, asked: false } as const;

  it('a person, when one acted or the case ends with one', () => {
    expect(resolverOf({ ...base, final: 'PAID', humanAction: true, vendorMessage: true })).toBe(
      'person',
    );
    expect(resolverOf({ ...base, final: 'ESCALATED' })).toBe('person');
  });

  it('the vendor by reply, when it answered (message or corrected bill)', () => {
    expect(resolverOf({ ...base, final: 'PAID', vendorMessage: true, asked: true })).toBe(
      'vendor_reply',
    );
  });

  it('new evidence after an ask, only when the gap actually closed', () => {
    expect(resolverOf({ ...base, final: 'PAID', asked: true })).toBe('vendor_evidence');
    // a PAY PART whose rest never got evidence did not close
    expect(resolverOf({ ...base, final: 'PART_PAID', asked: true })).toBe('agent');
    expect(resolverOf({ ...base, final: 'AWAITING_VENDOR', asked: true })).toBe('agent');
  });

  it('the agent otherwise', () => {
    expect(resolverOf({ ...base, final: 'PAID' })).toBe('agent');
    expect(resolverOf({ ...base, final: 'HELD' })).toBe('agent');
  });
});

describe('payout details reading accuracy', () => {
  const truth = findBill('sep-03').truth;
  const errors = (payoutDetails: string | null) =>
    readingErrors(truth, { ...truth, payoutDetails }).filter((e) => e.startsWith('payoutDetails'));

  it('is right when the reading equals or contains the whole truth', () => {
    expect(errors(truth.payoutDetails)).toEqual([]);
    expect(errors(`${truth.payoutDetails} — Daniela Ospina, C.C. 1.036.645.218`)).toEqual([]);
  });

  it('is wrong when the reading has only part of the truth, or none', () => {
    expect(errors(truth.payoutDetails!.slice(0, -4))).toHaveLength(1);
    expect(errors(null)).toHaveLength(1);
  });
});
