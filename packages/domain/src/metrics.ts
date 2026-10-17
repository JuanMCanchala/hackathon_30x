import { checkInvariants, evidencedAmount, type CheckerInput } from './checker';
import { convertToUsdMinor, parseDecimalToMinor } from './money';
import type { BillStatus } from './types';

export interface ScorecardInput extends CheckerInput {
  messages: { billId: string; from: 'agent' | 'vendor' }[];
  humanActions: { billId: string }[];
}

export interface Scorecard {
  /** cases: bills not superseded by a correction */
  bills: number;
  decidedWithoutPerson: number;
  autonomyPct: number;
  /** payments with at least one invariant violation */
  improperPayments: number;
  /** cases decided without a person after the vendor answered */
  vendorResolved: number;
  escalated: number;
  held: number;
  /** share of the billed USD value the evidence proves */
  evidenceCoveragePct: number;
  yieldKeptUsdMinor: number;
  feesSavedUsdMinor: number;
  /** from a bill's arrival to its payment (executed, else scheduled); null without data */
  medianHoursToPayment: number | null;
}

const FINAL_WITHOUT_PERSON: BillStatus[] = ['PAID', 'PART_PAID', 'HELD'];
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part * 1000) / whole) / 10 : 0;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function scorecard(input: ScorecardInput): Scorecard {
  const cases = input.bills.filter((b) => b.status !== 'SUPERSEDED');
  const on = (chain: string[], billId: string) => chain.includes(billId);
  let decided = 0;
  let vendorResolved = 0;
  let billedUsd = 0;
  let evidencedUsd = 0;
  for (const b of cases) {
    const chain = [b.id, ...b.chain];
    const byPerson = input.humanActions.some((a) => on(chain, a.billId));
    if (!byPerson && FINAL_WITHOUT_PERSON.includes(b.status)) {
      decided++;
      if (input.messages.some((m) => m.from === 'vendor' && on(chain, m.billId))) vendorResolved++;
    }
    const contract = input.contracts.find((c) => c.id === b.contractId);
    const billed = contract && parseDecimalToMinor(b.reading?.total, contract.currency);
    if (!contract || !billed || billed <= 0) continue;
    try {
      billedUsd += convertToUsdMinor(billed, contract.currency, input.fx);
      evidencedUsd += convertToUsdMinor(evidencedAmount(b, input), contract.currency, input.fx);
    } catch {
      // no usable rate: the case is left out of the coverage figure
    }
  }

  const live = input.payments.filter((p) => p.status !== 'returned');
  const hours = live.flatMap((p) => {
    const received = input.bills.find((b) => b.id === p.billId)?.receivedAt;
    const ms = received ? Date.parse(p.executedAt ?? p.scheduledFor) - Date.parse(received) : NaN;
    return Number.isFinite(ms) ? [ms / 3_600_000] : [];
  });
  const mid = median(hours);

  return {
    bills: cases.length,
    decidedWithoutPerson: decided,
    autonomyPct: pct(decided, cases.length),
    improperPayments: new Set(
      checkInvariants(input)
        .map((v) => v.paymentId)
        .filter((id) => id !== null),
    ).size,
    vendorResolved,
    escalated: cases.filter((b) => b.status === 'ESCALATED').length,
    held: cases.filter((b) => b.status === 'HELD').length,
    evidenceCoveragePct: pct(evidencedUsd, billedUsd),
    yieldKeptUsdMinor: live.reduce((s, p) => s + p.plan.yieldKeptUsdMinor, 0),
    feesSavedUsdMinor: live.reduce((s, p) => s + p.plan.feesSavedUsdMinor, 0),
    medianHoursToPayment: mid === null ? null : Math.round(mid * 10) / 10,
  };
}
