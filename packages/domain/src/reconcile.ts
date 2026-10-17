import { daysBetween } from './dates';
import type { Payment } from './payments';

export interface BankLine {
  id: string;
  date: string;
  description: string;
  /** debits are negative */
  amountUsdMinor: number;
  kind: 'debit' | 'fee' | 'return' | 'card';
}
export type MatchStatus = 'matched' | 'matched_fx' | 'fee' | 'returned' | 'unmatched';
export interface ReconMatch {
  lineId: string;
  paymentId: string | null;
  status: MatchStatus;
  fxDiffUsdMinor: number;
  note: string;
}

const AMOUNT_TOLERANCE_BPS = 150; // 1,5 %
const DATE_TOLERANCE_DAYS = 3;

function debitMatch(line: BankLine, p: Payment, note: string): ReconMatch {
  const fxDiffUsdMinor = Math.abs(line.amountUsdMinor) - p.plan.usdDebitMinor;
  return {
    lineId: line.id,
    paymentId: p.id,
    status: fxDiffUsdMinor === 0 ? 'matched' : 'matched_fx',
    fxDiffUsdMinor,
    note:
      fxDiffUsdMinor === 0
        ? note
        : `${note} Diferencia cambiaria de ${fxDiffUsdMinor} centavos de USD.`,
  };
}

export function reconcile(
  payments: Payment[],
  lines: BankLine[],
): { matches: ReconMatch[]; unmatchedPayments: string[] } {
  const results = new Map<string, ReconMatch>();
  const matchedPayments = new Set<string>();

  // Pass 1: lines that carry a payment reference.
  for (const line of lines) {
    const p = payments.find((x) => line.description.includes(x.reference));
    if (!p) continue;
    if (line.kind === 'fee') {
      results.set(line.id, {
        lineId: line.id,
        paymentId: p.id,
        status: 'fee',
        fxDiffUsdMinor: 0,
        note: `Comisión bancaria del pago ${p.reference}.`,
      });
    } else if (line.kind === 'return') {
      results.set(line.id, {
        lineId: line.id,
        paymentId: p.id,
        status: 'returned',
        fxDiffUsdMinor: 0,
        note: `El banco devolvió el pago ${p.reference}.`,
      });
    } else if (line.kind === 'debit') {
      matchedPayments.add(p.id);
      results.set(line.id, debitMatch(line, p, `Coincide por referencia ${p.reference}.`));
    }
  }

  // Pass 2: debit lines without a reference, by amount and date.
  for (const line of lines) {
    if (results.has(line.id) || line.kind !== 'debit') continue;
    const abs = Math.abs(line.amountUsdMinor);
    const p = payments
      .filter((x) => x.status === 'sent' && !matchedPayments.has(x.id))
      .filter((x) => {
        const when = (x.executedAt ?? x.scheduledFor).slice(0, 10);
        return (
          Math.abs(abs - x.plan.usdDebitMinor) * 10_000 <=
            x.plan.usdDebitMinor * AMOUNT_TOLERANCE_BPS &&
          Math.abs(daysBetween(when, line.date)) <= DATE_TOLERANCE_DAYS
        );
      })
      .sort(
        (x, y) => Math.abs(abs - x.plan.usdDebitMinor) - Math.abs(abs - y.plan.usdDebitMinor),
      )[0];
    if (!p) continue;
    matchedPayments.add(p.id);
    // Without a reference the match is never "exact", even when the amount is.
    results.set(line.id, {
      ...debitMatch(line, p, `Coincide por monto y fecha con ${p.reference} (sin referencia).`),
      status: 'matched_fx',
    });
  }

  const matches = lines.map(
    (l): ReconMatch =>
      results.get(l.id) ?? {
        lineId: l.id,
        paymentId: null,
        status: 'unmatched',
        fxDiffUsdMinor: 0,
        note: 'Movimiento sin pago asociado.',
      },
  );
  const unmatchedPayments = payments
    .filter((p) => p.status === 'sent' && !matchedPayments.has(p.id))
    .map((p) => p.id);
  return { matches, unmatchedPayments };
}
