/** CSV export for the reconciliation spreadsheet: what was paid, held or escalated, and why. */
import { asc, eq } from 'drizzle-orm';
import { minorToDecimal } from '@mandato/domain';
import {
  approvals,
  approvalRequests,
  decisions,
  invoices,
  ledgerEntries,
  payees,
  users,
} from '../db/schema';
import type { Executor } from '../db/client';
import { csvCell } from '../lib/common';

/** Byte-order mark so spreadsheet apps open the UTF-8 CSV with accents intact. */
const BOM = '\uFEFF';

const STATUS_ES: Record<string, string> = {
  PAID: 'Pagada por el agente',
  APPROVED: 'Pagada con aprobación',
  HELD: 'Frenada',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  REJECTED: 'Rechazada',
  RECEIVED: 'Recibida',
};

export async function reconciliationCsv(db: Executor, orgId: string): Promise<string> {
  const rows = await db
    .select({ invoice: invoices, decision: decisions })
    .from(invoices)
    .leftJoin(decisions, eq(decisions.invoiceId, invoices.id))
    .where(eq(invoices.orgId, orgId))
    .orderBy(asc(invoices.seq));
  const payeeRows = await db.select().from(payees).where(eq(payees.orgId, orgId));
  const userRows = await db.select().from(users).where(eq(users.orgId, orgId));
  const approvalRows = await db
    .select({ approval: approvals, invoiceId: approvalRequests.invoiceId })
    .from(approvals)
    .innerJoin(approvalRequests, eq(approvalRequests.id, approvals.requestId));
  const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.orgId, orgId));

  const header = [
    'referencia',
    'recibida',
    'periodo',
    'beneficiario',
    'numero_factura',
    'moneda',
    'monto',
    'monto_usd',
    'estado',
    'decision_agente',
    'aprobado_por',
    'motivo',
    'que_falto',
    'version_politica',
    'acuerdo',
    'hash_registro',
  ];
  const lines = rows.map(({ invoice: i, decision: d }) => {
    const payee = payeeRows.find((p) => p.id === i.payeeId)?.data.name ?? i.issuerName ?? '';
    const approvers = approvalRows
      .filter((a) => a.invoiceId === i.id && a.approval.action === 'approve')
      .map((a) => userRows.find((u) => u.id === a.approval.userId)?.name ?? a.approval.userId)
      .join(' + ');
    const entry = ledger.find((e) => e.entityId === i.id && e.type === 'DECISION_RECORDED');
    return [
      i.ref,
      i.receivedAt.toISOString(),
      i.periodKey,
      payee,
      i.invoiceNumber,
      i.currency,
      i.amountMinor !== null && i.currency ? minorToDecimal(i.amountMinor, i.currency) : '',
      i.usdCents !== null ? minorToDecimal(i.usdCents, 'USD') : '',
      STATUS_ES[i.status] ?? i.status,
      d?.outcome ?? '',
      approvers,
      d?.summary ?? '',
      (d?.counterfactual ?? []).join(' | '),
      d?.policyVersion ?? '',
      d?.mandateId ?? '',
      entry?.hash ?? '',
    ]
      .map(csvCell)
      .join(',');
  });
  return `${BOM}${[header.join(','), ...lines].join('\r\n')}\r\n`;
}
