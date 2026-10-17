/**
 * PostgreSQL schema (ADR-0009). Domain objects that are versioned or read as a whole (policy
 * terms, payees, mandates, extractions, decisions) are stored as JSONB next to the columns we
 * filter on. The ledger stores its hashed fields verbatim (`at` as text) so hashes can be
 * recomputed byte for byte.
 */
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  AgentScope,
  DecisionFacts,
  ExtractedInvoice,
  LedgerActor,
  Mandate,
  MandateProposalDraft,
  Payee,
  PolicyTerms,
  Requester,
  RuleResult,
  AuditReport,
} from '@mandato/domain';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalName: text('legal_name').notNull(),
  taxId: text('tax_id').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull(),
  timeZone: text('time_zone').notNull(),
  treasuryBalanceUsdCents: bigint('treasury_balance_usd_cents', { mode: 'number' }).notNull(),
  invoiceSeq: integer('invoice_seq').notNull().default(0),
  createdAt: ts('created_at').notNull(),
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    title: text('title').notNull(),
    role: text('role').$type<'operator' | 'approver' | 'controller' | 'admin'>().notNull(),
    canApprove: boolean('can_approve').notNull(),
    canSign: boolean('can_sign').notNull(),
  },
  (t) => [index('users_org_idx').on(t.orgId)],
);

export const policies = pgTable(
  'policies',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    version: integer('version').notNull(),
    terms: jsonb('terms').$type<PolicyTerms>().notNull(),
    note: text('note'),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('policies_org_version_idx').on(t.orgId, t.version)],
);

export const payees = pgTable(
  'payees',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    data: jsonb('data').$type<Payee>().notNull(),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('payees_org_idx').on(t.orgId)],
);

export const mandates = pgTable(
  'mandates',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    payeeId: text('payee_id').notNull(),
    status: text('status').$type<Mandate['status']>().notNull(),
    data: jsonb('data').$type<Mandate>().notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    index('mandates_org_payee_idx').on(t.orgId, t.payeeId),
    uniqueIndex('mandates_key_version_idx').on(t.orgId, t.key, t.version),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    sha256: text('sha256').notNull(),
    filename: text('filename').notNull(),
    mediaType: text('media_type').notNull(),
    size: integer('size').notNull(),
    storagePath: text('storage_path').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('documents_org_sha_idx').on(t.orgId, t.sha256)],
);

export interface ExtractionMeta {
  provider: 'claude' | 'replay' | 'ground-truth' | 'agent' | 'none';
  model: string | null;
  cacheHit: boolean;
  latencyMs: number | null;
  error: string | null;
  scanPhrases: string[];
}

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    seq: integer('seq').notNull(),
    ref: text('ref').notNull(),
    documentId: text('document_id'),
    source: text('source')
      .$type<'upload' | 'email' | 'chat' | 'agent' | 'dataset' | 'attack'>()
      .notNull(),
    requester: jsonb('requester').$type<Requester>().notNull(),
    datasetId: text('dataset_id'),
    title: text('title'),
    receivedAt: ts('received_at').notNull(),
    extraction: jsonb('extraction').$type<ExtractedInvoice | null>(),
    extractionMeta: jsonb('extraction_meta').$type<ExtractionMeta>().notNull(),
    status: text('status')
      .$type<'RECEIVED' | 'PAID' | 'HELD' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'>()
      .notNull(),
    outcome: text('outcome').$type<'PAY' | 'HOLD' | 'ESCALATE'>(),
    periodKey: text('period_key').notNull(),
    payeeId: text('payee_id'),
    issuerName: text('issuer_name'),
    issuerTaxIdNorm: text('issuer_tax_id_norm'),
    issuerNameFolded: text('issuer_name_folded'),
    destinationNorm: text('destination_norm'),
    invoiceNumber: text('invoice_number'),
    invoiceNumberNorm: text('invoice_number_norm'),
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text('currency'),
    usdCents: bigint('usd_cents', { mode: 'number' }),
    issueDate: text('issue_date'),
    dueDate: text('due_date'),
    servicePeriod: text('service_period'),
    decidedAt: ts('decided_at'),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('invoices_org_seq_idx').on(t.orgId, t.seq),
    index('invoices_org_status_idx').on(t.orgId, t.status),
    index('invoices_org_period_idx').on(t.orgId, t.periodKey),
    index('invoices_document_idx').on(t.documentId),
  ],
);

export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  invoiceId: text('invoice_id').notNull().unique(),
  outcome: text('outcome').$type<'PAY' | 'HOLD' | 'ESCALATE'>().notNull(),
  approvalsRequired: integer('approvals_required').notNull(),
  results: jsonb('results').$type<RuleResult[]>().notNull(),
  summary: text('summary').notNull(),
  counterfactual: jsonb('counterfactual').$type<string[]>().notNull(),
  facts: jsonb('facts').$type<DecisionFacts>().notNull(),
  policyVersion: integer('policy_version').notNull(),
  mandateId: text('mandate_id'),
  engineVersion: text('engine_version').notNull(),
  decidedAt: ts('decided_at').notNull(),
});

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    invoiceId: text('invoice_id').notNull().unique(),
    required: integer('required').notNull(),
    status: text('status').$type<'pending' | 'approved' | 'rejected'>().notNull(),
    createdAt: ts('created_at').notNull(),
    resolvedAt: ts('resolved_at'),
  },
  (t) => [index('approval_requests_org_status_idx').on(t.orgId, t.status)],
);

export const approvals = pgTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    userId: text('user_id').notNull(),
    action: text('action').$type<'approve' | 'reject'>().notNull(),
    note: text('note'),
    via: text('via').$type<'web' | 'link'>().notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [uniqueIndex('approvals_request_user_idx').on(t.requestId, t.userId)],
);

export const approvalLinks = pgTable('approval_links', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull(),
});

export interface ProposalImpact {
  avoidedEscalations: number;
}

export const proposals = pgTable(
  'proposals',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    invoiceId: text('invoice_id').notNull(),
    status: text('status').$type<'pending' | 'accepted' | 'rejected'>().notNull(),
    draft: jsonb('draft').$type<MandateProposalDraft>().notNull(),
    impact: jsonb('impact').$type<ProposalImpact>().notNull(),
    createdAt: ts('created_at').notNull(),
    resolvedAt: ts('resolved_at'),
    resolvedBy: text('resolved_by'),
    resolutionNote: text('resolution_note'),
    resultMandateId: text('result_mandate_id'),
  },
  (t) => [index('proposals_org_status_idx').on(t.orgId, t.status)],
);

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scope: jsonb('scope').$type<AgentScope>().notNull(),
  status: text('status').$type<'active' | 'revoked'>().notNull(),
  createdAt: ts('created_at').notNull(),
});

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    orgId: text('org_id').notNull(),
    type: text('type').notNull(),
    entityId: text('entity_id'),
    actor: jsonb('actor').$type<LedgerActor>().notNull(),
    payload: jsonb('payload').notNull(),
    at: text('at').notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull(),
  },
  (t) => [
    index('ledger_org_seq_idx').on(t.orgId, t.seq),
    index('ledger_entity_idx').on(t.entityId),
  ],
);

export const auditRuns = pgTable('audit_runs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  report: jsonb('report').$type<AuditReport>().notNull(),
  createdAt: ts('created_at').notNull(),
});
