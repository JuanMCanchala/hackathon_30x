/**
 * The anomaly radar: signals about a payee's behaviour that do not block a payment — the rules
 * already decide that — but tell a person what changed: an amount far from the usual, a second
 * bill a few days after the last, a bill off its usual day, a large first bill.
 * Deterministic and explainable, like the rules (ADR-0002).
 */
import { formatMoney, formatUsd } from './format';

export interface SignalBill {
  ref: string;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  /** Local calendar date the bill arrived, YYYY-MM-DD. */
  receivedOn: string;
  /** Paid or approved: an amount the company accepted. */
  accepted: boolean;
  rejected: boolean;
}

export type SignalKind =
  'amount_jump' | 'amount_drop' | 'quick_repeat' | 'off_cycle' | 'large_first';

export interface Signal {
  kind: SignalKind;
  /** "watch": worth a look before approving; "info": context. */
  level: 'watch' | 'info';
  title: string;
  detail: string;
}

const DAY = 86_400_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const dayOfMonth = (date: string) => Number(date.slice(8, 10));

/** Signals for `bill` given the same payee's earlier bills (any order). */
export function signalsFor(bill: SignalBill, earlier: readonly SignalBill[]): Signal[] {
  const signals: Signal[] = [];
  const history = earlier.filter((b) => b.receivedOn <= bill.receivedOn && b.ref !== bill.ref);

  // Amount far from what the company usually accepts from this payee.
  const accepted = history.filter(
    (b) => b.accepted && b.currency === bill.currency && b.amountMinor !== null,
  );
  if (bill.amountMinor !== null && bill.currency && accepted.length >= 1) {
    const usual = median(accepted.map((b) => b.amountMinor!));
    const ratio = bill.amountMinor / usual;
    if (ratio >= 1.25) {
      signals.push({
        kind: 'amount_jump',
        level: 'watch',
        title: `Cobra ${Math.round((ratio - 1) * 100)} % más de lo habitual`,
        detail: `${formatMoney(bill.amountMinor, bill.currency)} frente a ${formatMoney(Math.round(usual), bill.currency)}, lo que se le suele pagar.`,
      });
    } else if (ratio <= 0.5) {
      signals.push({
        kind: 'amount_drop',
        level: 'info',
        title: 'Cobra mucho menos de lo habitual',
        detail: `${formatMoney(bill.amountMinor, bill.currency)} frente a ${formatMoney(Math.round(usual), bill.currency)}: ¿es un cobro parcial?`,
      });
    }
  }

  // A second bill shortly after the previous one.
  const recent = history
    .filter((b) => !b.rejected)
    .map((b) => (Date.parse(bill.receivedOn) - Date.parse(b.receivedOn)) / DAY)
    .filter((days) => days >= 0 && days <= 10);
  if (recent.length > 0) {
    const days = Math.round(Math.min(...recent));
    signals.push({
      kind: 'quick_repeat',
      level: 'watch',
      title:
        days === 0
          ? 'Segundo cobro el mismo día'
          : `Segundo cobro en ${days} ${days === 1 ? 'día' : 'días'}`,
      detail: 'Este beneficiario ya había enviado otro cobro hace muy poco.',
    });
  }

  // Off its usual day of the month (only when the payee has a clear rhythm).
  const days = history.map((b) => dayOfMonth(b.receivedOn));
  if (days.length >= 2 && Math.max(...days) - Math.min(...days) <= 4) {
    const usualDay = Math.round(median(days));
    const today = dayOfMonth(bill.receivedOn);
    if (Math.abs(today - usualDay) > 7) {
      signals.push({
        kind: 'off_cycle',
        level: 'info',
        title: 'Llega fuera de su fecha habitual',
        detail: `Llegó el día ${today}; sus cobros suelen llegar alrededor del día ${usualDay}.`,
      });
    }
  }

  // A large first bill.
  if (history.length === 0 && bill.usdCents !== null && bill.usdCents >= 300_000) {
    signals.push({
      kind: 'large_first',
      level: 'info',
      title: 'Primer cobro, y no es pequeño',
      detail: `Es el primer cobro de este beneficiario y suma ${formatUsd(bill.usdCents)}.`,
    });
  }
  return signals;
}
