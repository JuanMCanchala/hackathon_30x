/**
 * The month's close: what used to be reconciled by hand in a spreadsheet (brief §02, step 5).
 * Every bill of the period with its result, who decided it, why, and the transfer that paid it.
 * Attack-lab traffic is left out: it is test traffic, not accounts payable.
 */
import { and, eq, ne } from 'drizzle-orm';
import { minorToDecimal } from '@mandato/domain';
import type { Executor } from '../db/client';
import { invoices } from '../db/schema';
import { listPayments, type PaymentView } from './payments';
import { listInvoices, type InvoiceListItem } from './views';

const RESULT: Record<string, string> = {
  PAID: 'Pagada sola',
  APPROVED: 'Pagada con aprobación',
  HELD: 'Frenada',
  REJECTED: 'Rechazada',
  PENDING_APPROVAL: 'Por aprobar',
  RECEIVED: 'Recibida',
};

export interface CloseRow {
  invoiceId: string;
  ref: string;
  title: string | null;
  receivedAt: string;
  payeeName: string;
  invoiceNumber: string | null;
  currency: string | null;
  amountMinor: number | null;
  usdCents: number | null;
  status: InvoiceListItem['status'];
  result: string;
  /** "El agente", the people who approved or rejected it, or null while it waits. */
  decidedBy: string | null;
  reason: string | null;
  payment: Pick<
    PaymentView,
    'rail' | 'railName' | 'reference' | 'scheduledFor' | 'status' | 'sentAt' | 'settledAt'
  > | null;
}

export interface MonthClose {
  period: string;
  periods: string[];
  totals: {
    bills: number;
    paidByAgent: number;
    approved: number;
    held: number;
    rejected: number;
    pending: number;
    /** Paid or approved, in USD at the policy's reference rates. */
    paidUsdCents: number;
    sentUsdCents: number;
    scheduledUsdCents: number;
    byCurrency: { currency: string; amountMinor: number; count: number }[];
  };
  rows: CloseRow[];
}

const isAttack = (i: InvoiceListItem) =>
  i.source === 'attack' || (i.datasetId?.startsWith('atk-') ?? false);

function decidedBy(i: InvoiceListItem): string | null {
  if (i.status === 'PAID' || i.status === 'HELD') return 'El agente';
  if (i.status === 'APPROVED' || i.status === 'REJECTED') return i.resolvedBy ?? 'Una persona';
  return null;
}

/** The periods that have bills, newest first. */
async function periodsOf(db: Executor, orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ period: invoices.periodKey })
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), ne(invoices.source, 'attack')));
  return rows.map((r) => r.period).sort((a, b) => b.localeCompare(a));
}

export async function monthClose(
  db: Executor,
  orgId: string,
  period?: string,
  currentPeriod?: string,
): Promise<MonthClose> {
  const periods = await periodsOf(db, orgId);
  // A close is for a month that ended: by default the latest one before the current month.
  const fallback =
    periods.find((p) => currentPeriod !== undefined && p < currentPeriod) ?? periods[0] ?? '';
  const chosen = period && periods.includes(period) ? period : fallback;
  const [items, transfers] = await Promise.all([
    chosen ? listInvoices(db, orgId, { period: chosen, limit: 500 }) : [],
    listPayments(db, orgId),
  ]);
  const byInvoice = new Map(transfers.map((p) => [p.invoiceId, p]));
  const rows: CloseRow[] = items
    .filter((i) => !isAttack(i))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
    .map((i) => {
      const p = byInvoice.get(i.id);
      return {
        invoiceId: i.id,
        ref: i.ref,
        title: i.title,
        receivedAt: i.receivedAt,
        payeeName: i.payeeName ?? i.issuerName ?? '',
        invoiceNumber: i.invoiceNumber,
        currency: i.currency,
        amountMinor: i.amountMinor,
        usdCents: i.usdCents,
        status: i.status,
        result: RESULT[i.status] ?? i.status,
        decidedBy: decidedBy(i),
        reason: i.summary,
        payment: p
          ? {
              rail: p.rail,
              railName: p.railName,
              reference: p.reference,
              scheduledFor: p.scheduledFor,
              status: p.status,
              sentAt: p.sentAt,
              settledAt: p.settledAt,
            }
          : null,
      };
    });

  const paid = rows.filter((r) => r.status === 'PAID' || r.status === 'APPROVED');
  const currencies = new Map<string, { amountMinor: number; count: number }>();
  for (const r of paid) {
    if (!r.currency || r.amountMinor === null) continue;
    const c = currencies.get(r.currency) ?? { amountMinor: 0, count: 0 };
    currencies.set(r.currency, { amountMinor: c.amountMinor + r.amountMinor, count: c.count + 1 });
  }
  const sum = (list: CloseRow[]) => list.reduce((s, r) => s + (r.usdCents ?? 0), 0);
  return {
    period: chosen,
    periods,
    totals: {
      bills: rows.length,
      paidByAgent: rows.filter((r) => r.status === 'PAID').length,
      approved: rows.filter((r) => r.status === 'APPROVED').length,
      held: rows.filter((r) => r.status === 'HELD').length,
      rejected: rows.filter((r) => r.status === 'REJECTED').length,
      pending: rows.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'RECEIVED')
        .length,
      paidUsdCents: sum(paid),
      sentUsdCents: sum(paid.filter((r) => r.payment && r.payment.status !== 'scheduled')),
      scheduledUsdCents: sum(paid.filter((r) => r.payment?.status === 'scheduled')),
      byCurrency: [...currencies]
        .map(([currency, c]) => ({ currency, ...c }))
        .sort((a, b) => b.count - a.count),
    },
    rows,
  };
}

/**
 * One cell for a semicolon-separated sheet. Text that a vendor wrote could start like a formula
 * ("=HYPERLINK(…)"), so such text is kept as text with a leading apostrophe.
 */
function cell(value: string, numeric = false): string {
  const text = !numeric && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A decimal with a comma, as a spreadsheet in Spanish reads numbers. */
const decimal = (minor: number | null, currency: string | null) =>
  minor !== null && currency ? minorToDecimal(minor, currency).replace('.', ',') : '';

/**
 * The close as a CSV that Excel in Spanish opens as a table: byte-order mark for the accents,
 * semicolons between columns and decimal commas.
 */
export function closeCsv(close: MonthClose): string {
  const header = [
    'comprobante',
    'recibida',
    'beneficiario',
    'factura',
    'moneda',
    'monto',
    'monto_usd',
    'resultado',
    'decidio',
    'motivo',
    'riel',
    'referencia_transferencia',
    'sale_o_salio',
    'llego',
  ];
  const lines = close.rows.map((r) =>
    [
      cell(r.ref),
      cell(r.receivedAt.slice(0, 10)),
      cell(r.payeeName),
      cell(r.invoiceNumber ?? ''),
      cell(r.currency ?? ''),
      cell(decimal(r.amountMinor, r.currency), true),
      cell(decimal(r.usdCents, 'USD'), true),
      cell(r.result),
      cell(r.decidedBy ?? 'Pendiente'),
      cell(r.reason ?? ''),
      cell(r.payment?.railName ?? ''),
      cell(r.payment?.reference ?? ''),
      cell(r.payment?.scheduledFor ?? ''),
      cell(r.payment?.settledAt?.slice(0, 10) ?? ''),
    ].join(';'),
  );
  return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
}
