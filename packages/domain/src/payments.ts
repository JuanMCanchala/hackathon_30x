/**
 * Paying what was decided (ADR-0018). A decision says *whether* to pay; this says *when* and
 * *how*: on the bill's due date (never before, never late), through the rail that matches the
 * payee's registered destination. Pure functions: the simulated rail and the real ones share them.
 */
import type { PayoutMethod } from './schemas';

export type Settlement = 'instant' | 'next_business_day' | 'two_business_days';

export interface Rail {
  method: PayoutMethod;
  name: string;
  /** Prefix of the transfer reference. */
  code: string;
  settlement: Settlement;
}

export const RAILS: Record<PayoutMethod, Rail> = {
  bre_b: { method: 'bre_b', name: 'Bre-B', code: 'BREB', settlement: 'instant' },
  spei: { method: 'spei', name: 'SPEI', code: 'SPEI', settlement: 'instant' },
  pix: { method: 'pix', name: 'Pix', code: 'PIX', settlement: 'instant' },
  ach: { method: 'ach', name: 'ACH', code: 'ACH', settlement: 'next_business_day' },
  wire: {
    method: 'wire',
    name: 'Transferencia internacional',
    code: 'SWIFT',
    settlement: 'two_business_days',
  },
  card: { method: 'card', name: 'Cargo a la tarjeta', code: 'CARD', settlement: 'instant' },
  other: { method: 'other', name: 'Otro medio', code: 'PAGO', settlement: 'two_business_days' },
};

export const SETTLEMENT_COPY: Record<Settlement, string> = {
  instant: 'llega en segundos',
  next_business_day: 'llega el siguiente día hábil',
  two_business_days: 'llega en dos días hábiles',
};

const DAY = 86_400_000;

function weekday(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** The same day if it is a weekday, otherwise the following Monday. */
export function nextBusinessDay(isoDate: string): string {
  const d = weekday(isoDate);
  return d === 6 ? addDays(isoDate, 2) : d === 0 ? addDays(isoDate, 1) : isoDate;
}

export function addBusinessDays(isoDate: string, days: number): string {
  let date = nextBusinessDay(isoDate);
  for (let i = 0; i < days; i++) date = nextBusinessDay(addDays(date, 1));
  return date;
}

/**
 * When to pay: on the due date, so the money stays in the company until it is owed — but never
 * before the decision and never late. Weekends move to the next business day.
 */
export function paymentDate(dueDate: string | null, decidedOn: string): string {
  const target = dueDate && dueDate > decidedOn ? dueDate : decidedOn;
  return nextBusinessDay(target);
}

export function expectedSettlement(rail: Rail, sentOn: string): string {
  if (rail.settlement === 'instant') return sentOn;
  return addBusinessDays(sentOn, rail.settlement === 'next_business_day' ? 1 : 2);
}

/** A readable, deterministic transfer reference: BREB-20260803-MND0004. */
export function transferReference(rail: Rail, invoiceRef: string, sentOn: string): string {
  return `${rail.code}-${sentOn.replaceAll('-', '')}-${invoiceRef.replace(/[^A-Za-z0-9]/g, '')}`;
}
