/**
 * Loads everything the pure engine needs from the database. Runs inside the organization lock,
 * so what the engine sees cannot change before the decision is stored (ADR-0011).
 */
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  ExtractedInvoiceSchema,
  type DecisionContext,
  type ExtractedInvoice,
  type HistoryInvoice,
  type InstructionScan,
  type InvoiceSource,
  type Mandate,
  type OrganizationProfile,
  type Payee,
  type PolicyTerms,
  type Requester,
} from '@mandato/domain';
import type { Executor } from '../db/client';
import { invoices, mandates, organizations, payees, policies } from '../db/schema';
import { notFound } from '../lib/common';

export async function loadOrganization(db: Executor, orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound('La organización');
  return org;
}

export function profileOf(org: Awaited<ReturnType<typeof loadOrganization>>): OrganizationProfile {
  return {
    id: org.id,
    name: org.name,
    legalName: org.legalName,
    taxId: org.taxId,
    aliases: org.aliases,
    timeZone: org.timeZone,
  };
}

export async function currentPolicy(db: Executor, orgId: string) {
  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.orgId, orgId))
    .orderBy(desc(policies.version))
    .limit(1);
  if (!policy) throw notFound('La política');
  return policy;
}

export async function loadPayees(db: Executor, orgId: string): Promise<Payee[]> {
  const rows = await db.select().from(payees).where(eq(payees.orgId, orgId));
  return rows.map((r) => r.data);
}

export async function loadMandates(db: Executor, orgId: string): Promise<Mandate[]> {
  const rows = await db.select().from(mandates).where(eq(mandates.orgId, orgId));
  return rows.map((r) => ({ ...r.data, status: r.status }));
}

export async function loadHistory(
  db: Executor,
  orgId: string,
  excludeInvoiceId?: string,
): Promise<HistoryInvoice[]> {
  const conditions = [eq(invoices.orgId, orgId), ne(invoices.status, 'RECEIVED')];
  if (excludeInvoiceId) conditions.push(ne(invoices.id, excludeInvoiceId));
  const rows = await db
    .select()
    .from(invoices)
    .where(and(...conditions));
  return rows.map((r) => ({
    invoiceId: r.id,
    ref: r.ref,
    payeeId: r.payeeId,
    issuerTaxIdNorm: r.issuerTaxIdNorm,
    issuerNameFolded: r.issuerNameFolded,
    destinationNorm: r.destinationNorm,
    invoiceNumber: r.invoiceNumber,
    invoiceNumberNorm: r.invoiceNumberNorm,
    amountMinor: r.amountMinor,
    currency: r.currency,
    usdCents: r.usdCents,
    issueDate: r.issueDate,
    servicePeriod: r.servicePeriod,
    periodKey: r.periodKey,
    status: r.status,
    decidedAt: (r.decidedAt ?? r.receivedAt).toISOString(),
  }));
}

/** Money committed to payments (paid by the agent or approved by people), all periods. */
export async function committedUsdCents(
  db: Executor,
  orgId: string,
  periodKey?: string,
): Promise<number> {
  const conditions = [eq(invoices.orgId, orgId), inArray(invoices.status, ['PAID', 'APPROVED'])];
  if (periodKey) conditions.push(eq(invoices.periodKey, periodKey));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${invoices.usdCents}), 0)` })
    .from(invoices)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

export interface ContextInput {
  orgId: string;
  now: string;
  extraction: ExtractedInvoice | null;
  extractionError: string | null;
  source: InvoiceSource;
  instructionScan: InstructionScan;
  requester: Requester;
  excludeInvoiceId?: string;
}

export async function buildDecisionContext(
  db: Executor,
  input: ContextInput,
): Promise<DecisionContext> {
  const org = await loadOrganization(db, input.orgId);
  const policy = await currentPolicy(db, input.orgId);
  const committed = await committedUsdCents(db, input.orgId);
  return {
    now: input.now,
    organization: profileOf(org),
    invoice: {
      extraction: input.extraction ? ExtractedInvoiceSchema.parse(input.extraction) : null,
      extractionError: input.extractionError,
      source: input.source,
      instructionScan: input.instructionScan,
    },
    policy: { version: policy.version, terms: policy.terms as PolicyTerms },
    payees: await loadPayees(db, input.orgId),
    mandates: await loadMandates(db, input.orgId),
    history: await loadHistory(db, input.orgId, input.excludeInvoiceId),
    treasury: { availableUsdCents: org.treasuryBalanceUsdCents - committed },
    requester: input.requester,
  };
}
