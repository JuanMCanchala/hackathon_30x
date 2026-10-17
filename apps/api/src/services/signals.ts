/**
 * The anomaly radar over stored bills: each bill compared with the same payee's earlier ones.
 * Attack-lab bills can be inspected but never count as history.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { localDate, signalsFor, type Signal, type SignalBill } from '@mandato/domain';
import type { Executor } from '../db/client';
import { invoices, organizations, payees } from '../db/schema';

type Row = typeof invoices.$inferSelect;

function toSignalBill(row: Row, timeZone: string): SignalBill {
  return {
    ref: row.ref,
    amountMinor: row.amountMinor,
    currency: row.currency,
    usdCents: row.usdCents,
    receivedOn: localDate(row.receivedAt.toISOString(), timeZone),
    accepted: row.status === 'PAID' || row.status === 'APPROVED',
    rejected: row.status === 'REJECTED',
  };
}

async function payeeBills(db: Executor, orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), isNotNull(invoices.payeeId)));
  return { timeZone: org?.timeZone ?? 'UTC', rows };
}

function compute(row: Row, all: Row[], timeZone: string): Signal[] {
  const earlier = all.filter(
    (r) =>
      r.payeeId === row.payeeId &&
      r.id !== row.id &&
      r.source !== 'attack' &&
      r.receivedAt.getTime() < row.receivedAt.getTime(),
  );
  return signalsFor(
    toSignalBill(row, timeZone),
    earlier.map((r) => toSignalBill(r, timeZone)),
  );
}

export async function signalsForInvoice(db: Executor, orgId: string, invoiceId: string) {
  const { timeZone, rows } = await payeeBills(db, orgId);
  const row = rows.find((r) => r.id === invoiceId);
  return row ? compute(row, rows, timeZone) : [];
}

export interface RadarItem {
  invoiceId: string;
  ref: string;
  title: string | null;
  payeeName: string;
  receivedAt: string;
  signals: Signal[];
}

/** The most recent bills with something worth a look, real traffic only. */
export async function radar(db: Executor, orgId: string, limit = 6): Promise<RadarItem[]> {
  const { timeZone, rows } = await payeeBills(db, orgId);
  const names = new Map(
    (await db.select().from(payees).where(eq(payees.orgId, orgId))).map((p) => [p.id, p.data.name]),
  );
  return rows
    .filter((r) => r.source !== 'attack')
    .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
    .map((r) => ({
      invoiceId: r.id,
      ref: r.ref,
      title: r.title,
      payeeName: names.get(r.payeeId!) ?? r.issuerName ?? '',
      receivedAt: r.receivedAt.toISOString(),
      signals: compute(r, rows, timeZone),
    }))
    .filter((item) => item.signals.length > 0)
    .slice(0, limit);
}
