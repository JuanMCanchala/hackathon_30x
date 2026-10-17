/** Read models for the UI and the agent gateway. */
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { InvoiceStatus } from '@mandato/domain';
import type { Executor } from '../db/client';
import {
  approvalRequests,
  approvals,
  decisions,
  documents,
  invoices,
  ledgerEntries,
  mandates,
  payees,
  proposals,
  users,
} from '../db/schema';
import { documentKind } from '../extraction/prepare';
import { notFound } from '../lib/common';

type InvoiceRow = typeof invoices.$inferSelect;

export const STATUS_FILTERS: Record<string, InvoiceStatus[]> = {
  pagadas: ['PAID', 'APPROVED'],
  frenadas: ['HELD'],
  pendientes: ['PENDING_APPROVAL'],
  rechazadas: ['REJECTED'],
};

export interface InvoiceListItem {
  id: string;
  ref: string;
  title: string | null;
  source: InvoiceRow['source'];
  datasetId: string | null;
  status: InvoiceRow['status'];
  outcome: InvoiceRow['outcome'];
  periodKey: string;
  receivedAt: string;
  payeeId: string | null;
  payeeName: string | null;
  issuerName: string | null;
  invoiceNumber: string | null;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  dueDate: string | null;
  summary: string | null;
  approvalsRequired: number;
  approvalsCount: number;
  documentKind: string | null;
}

async function payeeNames(db: Executor, orgId: string): Promise<Map<string, string>> {
  const rows = await db.select().from(payees).where(eq(payees.orgId, orgId));
  return new Map(rows.map((r) => [r.id, r.data.name]));
}

export async function listInvoices(
  db: Executor,
  orgId: string,
  filters: { status?: string; period?: string; q?: string; source?: string; limit?: number } = {},
): Promise<InvoiceListItem[]> {
  const conditions: SQL[] = [eq(invoices.orgId, orgId)];
  const statuses = filters.status ? STATUS_FILTERS[filters.status] : undefined;
  if (statuses) conditions.push(inArray(invoices.status, statuses));
  if (filters.period) conditions.push(eq(invoices.periodKey, filters.period));
  if (filters.source) conditions.push(eq(invoices.source, filters.source as InvoiceRow['source']));
  if (filters.q) {
    const like = `%${filters.q}%`;
    const search = or(
      ilike(invoices.ref, like),
      ilike(invoices.title, like),
      ilike(invoices.issuerName, like),
      ilike(invoices.invoiceNumber, like),
    );
    if (search) conditions.push(search);
  }
  const rows = await db
    .select({
      invoice: invoices,
      summary: decisions.summary,
      approvalsRequired: decisions.approvalsRequired,
      mediaType: documents.mediaType,
      filename: documents.filename,
      approvalsCount: sql<number>`(select count(*)::int from ${approvals} a join ${approvalRequests} r on r.id = a.request_id where r.invoice_id = ${invoices.id} and a.action = 'approve')`,
    })
    .from(invoices)
    .leftJoin(decisions, eq(decisions.invoiceId, invoices.id))
    .leftJoin(documents, eq(documents.id, invoices.documentId))
    .where(and(...conditions))
    .orderBy(desc(invoices.receivedAt), desc(invoices.seq))
    .limit(filters.limit ?? 200);
  const names = await payeeNames(db, orgId);
  return rows.map(
    ({ invoice: i, summary, approvalsRequired, mediaType, filename, approvalsCount }) => ({
      id: i.id,
      ref: i.ref,
      title: i.title,
      source: i.source,
      datasetId: i.datasetId,
      status: i.status,
      outcome: i.outcome,
      periodKey: i.periodKey,
      receivedAt: i.receivedAt.toISOString(),
      payeeId: i.payeeId,
      payeeName: i.payeeId ? (names.get(i.payeeId) ?? null) : null,
      issuerName: i.issuerName,
      invoiceNumber: i.invoiceNumber,
      amountMinor: i.amountMinor,
      currency: i.currency,
      usdCents: i.usdCents,
      dueDate: i.dueDate,
      summary: summary ?? null,
      approvalsRequired: approvalsRequired ?? 0,
      approvalsCount: Number(approvalsCount ?? 0),
      documentKind:
        mediaType && filename
          ? documentKind(mediaType, filename)
          : i.source === 'agent'
            ? 'agent'
            : null,
    }),
  );
}

export async function getInvoiceDetail(db: Executor, orgId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)));
  if (!invoice) throw notFound('La factura');
  const [decision] = await db.select().from(decisions).where(eq(decisions.invoiceId, invoice.id));
  const [document] = invoice.documentId
    ? await db.select().from(documents).where(eq(documents.id, invoice.documentId))
    : [];
  const [request] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.invoiceId, invoice.id));
  const approvalRows = request
    ? await db
        .select({ approval: approvals, name: users.name, title: users.title })
        .from(approvals)
        .innerJoin(users, eq(users.id, approvals.userId))
        .where(eq(approvals.requestId, request.id))
        .orderBy(asc(approvals.createdAt))
    : [];
  const [proposal] = await db.select().from(proposals).where(eq(proposals.invoiceId, invoice.id));
  const [payee] = invoice.payeeId
    ? await db.select().from(payees).where(eq(payees.id, invoice.payeeId))
    : [];
  const [mandate] = decision?.mandateId
    ? await db.select().from(mandates).where(eq(mandates.id, decision.mandateId))
    : [];
  const ledger = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.orgId, orgId), eq(ledgerEntries.entityId, invoice.id)))
    .orderBy(asc(ledgerEntries.seq));
  const approvers = await db
    .select({ id: users.id, name: users.name, title: users.title })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.canApprove, true)));

  return {
    id: invoice.id,
    ref: invoice.ref,
    title: invoice.title,
    source: invoice.source,
    datasetId: invoice.datasetId,
    requester: invoice.requester,
    receivedAt: invoice.receivedAt.toISOString(),
    decidedAt: invoice.decidedAt?.toISOString() ?? null,
    resolvedAt: invoice.resolvedAt?.toISOString() ?? null,
    status: invoice.status,
    outcome: invoice.outcome,
    periodKey: invoice.periodKey,
    issuerName: invoice.issuerName,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    servicePeriod: invoice.servicePeriod,
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    usdCents: invoice.usdCents,
    payee: payee ? payee.data : null,
    document: document
      ? {
          id: document.id,
          filename: document.filename,
          mediaType: document.mediaType,
          kind: documentKind(document.mediaType, document.filename),
          size: document.size,
          sha256: document.sha256,
        }
      : null,
    extraction: invoice.extraction,
    extractionMeta: invoice.extractionMeta,
    decision: decision
      ? {
          outcome: decision.outcome,
          approvalsRequired: decision.approvalsRequired,
          results: decision.results,
          summary: decision.summary,
          counterfactual: decision.counterfactual,
          facts: decision.facts,
          policyVersion: decision.policyVersion,
          mandateId: decision.mandateId,
          engineVersion: decision.engineVersion,
          decidedAt: decision.decidedAt.toISOString(),
        }
      : null,
    mandate: mandate ? mandate.data : null,
    approval: request
      ? {
          requestId: request.id,
          required: request.required,
          status: request.status,
          approvals: approvalRows.map(({ approval, name, title }) => ({
            userId: approval.userId,
            name,
            title,
            action: approval.action,
            note: approval.note,
            via: approval.via,
            at: approval.createdAt.toISOString(),
          })),
          approvers,
        }
      : null,
    proposal: proposal
      ? {
          id: proposal.id,
          status: proposal.status,
          title: proposal.draft.title,
          draft: proposal.draft,
          impact: proposal.impact,
          resolvedBy: proposal.resolvedBy
            ? ((
                await db
                  .select({ name: users.name })
                  .from(users)
                  .where(eq(users.id, proposal.resolvedBy))
              )[0]?.name ?? proposal.resolvedBy)
            : null,
          resolutionNote: proposal.resolutionNote,
        }
      : null,
    ledger: ledger.map((e) => ({
      seq: e.seq,
      type: e.type,
      at: e.at,
      actor: e.actor,
      hash: e.hash,
      prevHash: e.prevHash,
    })),
  };
}

export type InvoiceDetail = Awaited<ReturnType<typeof getInvoiceDetail>>;

export async function listPendingApprovals(db: Executor, orgId: string) {
  const pending = await listInvoices(db, orgId, { status: 'pendientes', limit: 500 });
  const detailed = await Promise.all(pending.map((p) => getInvoiceDetail(db, orgId, p.id)));
  return detailed.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

export async function listProposals(db: Executor, orgId: string, status?: string) {
  const conditions: SQL[] = [eq(proposals.orgId, orgId)];
  if (status === 'pending' || status === 'accepted' || status === 'rejected') {
    conditions.push(eq(proposals.status, status));
  }
  const rows = await db
    .select({ proposal: proposals, ref: invoices.ref, invoiceTitle: invoices.title })
    .from(proposals)
    .innerJoin(invoices, eq(invoices.id, proposals.invoiceId))
    .where(and(...conditions))
    .orderBy(desc(proposals.createdAt));
  const userRows = await db.select().from(users).where(eq(users.orgId, orgId));
  return rows.map(({ proposal, ref, invoiceTitle }) => ({
    id: proposal.id,
    status: proposal.status,
    invoiceId: proposal.invoiceId,
    invoiceRef: ref,
    invoiceTitle,
    draft: proposal.draft,
    impact: proposal.impact,
    createdAt: proposal.createdAt.toISOString(),
    resolvedAt: proposal.resolvedAt?.toISOString() ?? null,
    resolvedBy: userRows.find((u) => u.id === proposal.resolvedBy)?.name ?? null,
    resolutionNote: proposal.resolutionNote,
    resultMandateId: proposal.resultMandateId,
  }));
}

export async function listPayees(db: Executor, orgId: string) {
  const rows = await db.select().from(payees).where(eq(payees.orgId, orgId));
  const mandateRows = await db.select().from(mandates).where(eq(mandates.orgId, orgId));
  const stats = await db
    .select({
      payeeId: invoices.payeeId,
      paid: sql<number>`count(*) filter (where ${invoices.status} in ('PAID','APPROVED'))::int`,
      escalated: sql<number>`count(*) filter (where ${invoices.outcome} = 'ESCALATE')::int`,
      usd: sql<string>`coalesce(sum(${invoices.usdCents}) filter (where ${invoices.status} in ('PAID','APPROVED')), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.orgId, orgId))
    .groupBy(invoices.payeeId);
  return rows
    .map((r) => {
      const active = mandateRows
        .filter((m) => m.payeeId === r.id && m.status === 'active')
        .sort((a, b) => b.version - a.version)[0];
      const s = stats.find((x) => x.payeeId === r.id);
      return {
        ...r.data,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        mandate: active ? active.data : null,
        mandateVersions: mandateRows.filter((m) => m.payeeId === r.id).length,
        stats: { paid: s?.paid ?? 0, escalated: s?.escalated ?? 0, usdCents: Number(s?.usd ?? 0) },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function listMandates(db: Executor, orgId: string) {
  const rows = await db
    .select()
    .from(mandates)
    .where(eq(mandates.orgId, orgId))
    .orderBy(desc(mandates.createdAt));
  const payeeRows = await db.select().from(payees).where(eq(payees.orgId, orgId));
  return rows.map((r) => ({
    ...r.data,
    status: r.status,
    payeeName: payeeRows.find((p) => p.id === r.payeeId)?.data.name ?? r.payeeId,
  }));
}

export async function listLedger(
  db: Executor,
  orgId: string,
  options: { limit?: number; before?: number } = {},
) {
  const conditions: SQL[] = [eq(ledgerEntries.orgId, orgId)];
  if (options.before) conditions.push(sql`${ledgerEntries.seq} < ${options.before}`);
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntries.seq))
    .limit(options.limit ?? 100);
  return rows;
}

export async function listUsers(db: Executor, orgId: string) {
  return db.select().from(users).where(eq(users.orgId, orgId)).orderBy(asc(users.name));
}
