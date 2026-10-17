import type { InvoiceStatus, Outcome } from './types';

export interface MetricInvoice {
  periodKey: string;
  outcome: Outcome | null;
  status: InvoiceStatus;
  usdCents: number | null;
}

export interface PeriodMetrics {
  periodKey: string;
  total: number;
  paidByAgent: number;
  heldByAgent: number;
  escalated: number;
  approved: number;
  rejected: number;
  pending: number;
  /** Bills decided without a person (PAY or HOLD) ÷ all decided bills. */
  autonomy: number;
  committedUsdCents: number;
}

export function periodMetrics(invoices: readonly MetricInvoice[]): PeriodMetrics[] {
  const byPeriod = new Map<string, MetricInvoice[]>();
  for (const invoice of invoices) {
    if (!invoice.outcome) continue;
    const list = byPeriod.get(invoice.periodKey) ?? [];
    list.push(invoice);
    byPeriod.set(invoice.periodKey, list);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([periodKey, list]) => {
      const paidByAgent = list.filter((i) => i.outcome === 'PAY').length;
      const heldByAgent = list.filter((i) => i.outcome === 'HOLD').length;
      const escalated = list.filter((i) => i.outcome === 'ESCALATE').length;
      return {
        periodKey,
        total: list.length,
        paidByAgent,
        heldByAgent,
        escalated,
        approved: list.filter((i) => i.status === 'APPROVED').length,
        rejected: list.filter((i) => i.status === 'REJECTED').length,
        pending: list.filter((i) => i.status === 'PENDING_APPROVAL').length,
        autonomy: list.length ? (paidByAgent + heldByAgent) / list.length : 0,
        committedUsdCents: list
          .filter((i) => i.status === 'PAID' || i.status === 'APPROVED')
          .reduce((s, i) => s + (i.usdCents ?? 0), 0),
      };
    });
}
