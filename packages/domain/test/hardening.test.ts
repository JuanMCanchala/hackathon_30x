import { describe, expect, it } from 'vitest';
import { activeContract, decide } from '../src/engine';
import * as domain from '../src/index';
import type { CheckId, Decision } from '../src/types';
import {
  context,
  CONTRACTS,
  herrera,
  history,
  hourlyBill,
  hoursLine,
  RATE_MINOR,
  timeEntries,
} from './fixtures';

const check = (d: Decision, id: CheckId) => d.checks.find((c) => c.id === id)!;

describe('vendor.payout scans every text of the bill', () => {
  it('escalates a different account written only in a line description', () => {
    const line = {
      ...hoursLine('120'),
      description: 'Horas de desarrollo — consignar a la cuenta Bancolombia 9876543210',
    };
    const d = decide(context(hourlyBill('120', { lines: [line] }), { evidence: timeEntries(120) }));
    expect(d.outcome).toBe('ESCALATE');
    expect(check(d, 'vendor.payout').status).toBe('fail');
  });

  it('escalates a different account written only in payoutDetails', () => {
    const d = decide(
      context(hourlyBill('120', { payoutDetails: 'Cuenta de ahorros Bancolombia 9876543210' }), {
        evidence: timeEntries(120),
      }),
    );
    expect(d.outcome).toBe('ESCALATE');
    expect(check(d, 'vendor.payout').status).toBe('fail');
  });
});

describe('a revision billed below what was already paid', () => {
  it('escalates through evidence.coverage', () => {
    const d = decide(
      context(hourlyBill('80', { revisionOf: 'DO-2026-10' }), {
        billId: 'b-rev',
        chain: ['b-rev', 'b-orig'],
        evidence: timeEntries(92),
        case: { paidMinor: 92 * RATE_MINOR, askedAt: '2026-11-01' },
        history: [history({ billId: 'b-orig', status: 'PART_PAID', paidMinor: 92 * RATE_MINOR })],
      }),
    );
    expect(d.outcome).toBe('ESCALATE');
    expect(d.payNowMinor).toBe(0);
    const c = check(d, 'evidence.coverage');
    expect(c.status).toBe('fail');
    expect(c.onFail).toBe('ESCALATE');
    expect(c.detail).toContain('Ya se pagó más de lo que ahora se cobra');
  });
});

describe('vendor.deadline covers every pending request', () => {
  it('escalates an over-rate bill the vendor did not correct in time', () => {
    const d = decide(
      context(hourlyBill('10', { lines: [hoursLine('10', '130000.00')], total: '1300000.00' }), {
        evidence: timeEntries(10),
        case: { paidMinor: 0, askedAt: '2026-10-27T15:00:00Z' }, // 6 days before NOW, limit 5
      }),
    );
    expect(check(d, 'terms.price').status).toBe('fail');
    expect(check(d, 'vendor.deadline').status).toBe('fail');
    expect(d.outcome).toBe('ESCALATE');
  });

  it('still asks within the deadline', () => {
    const d = decide(
      context(hourlyBill('10', { lines: [hoursLine('10', '130000.00')], total: '1300000.00' }), {
        evidence: timeEntries(10),
        case: { paidMinor: 0, askedAt: '2026-10-29T15:00:00Z' },
      }),
    );
    expect(d.outcome).toBe('ASK_VENDOR');
  });
});

describe('impossible dates', () => {
  it('no contract is active on a day that does not exist', () => {
    expect(activeContract(herrera, CONTRACTS, '2026-13-45')).toBeNull();
    expect(activeContract(herrera, CONTRACTS, '2026-02-30')).toBeNull();
    expect(activeContract(herrera, CONTRACTS, '2026-02-28')).not.toBeNull();
  });

  it('a period ending on 2026-02-30 is not a valid period', () => {
    const d = decide(
      context(
        hourlyBill('8', {
          periodFrom: '2026-02-01',
          periodTo: '2026-02-30',
          issueDate: '2026-03-01',
        }),
        { evidence: timeEntries(8, '2026-02-02') },
      ),
    );
    expect(check(d, 'reading.period').status).toBe('fail');
    expect(d.outcome).not.toBe('PAY');
  });
});

describe('public surface', () => {
  it('exposes only resolveVendor and activeContract from the checks module', () => {
    expect(typeof domain.resolveVendor).toBe('function');
    expect(typeof domain.activeContract).toBe('function');
    expect(typeof domain.decide).toBe('function');
    expect('runChecks' in domain).toBe(false);
  });
});

describe('odd time entries from a source', () => {
  it('counts fractional or negative minutes as no evidence, without crashing', () => {
    const odd = timeEntries(10).map((e, i) => ({ ...e, minutes: i === 0 ? 479.5 : -60 }));
    const d = decide(context(hourlyBill('10'), { evidence: odd }));
    expect(d.evidencedMinor).toBe(0);
    expect(d.payNowMinor).toBe(0);
  });
});
