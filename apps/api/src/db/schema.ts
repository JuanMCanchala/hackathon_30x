/**
 * PostgreSQL schema. Domain objects read as a whole (vendors, contracts, readings, decisions,
 * evidence, payments) are JSONB next to the columns we filter on. Every table carries org_id.
 * Times are ISO strings from the simulated clock, stored as text verbatim.
 */
import type {
  BankLine,
  Contract,
  Decision,
  EvidenceItem,
  ExtractedBill,
  LineMatch,
  Payment,
  Vendor,
} from '@recibido/domain';
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

const org = () => text('org_id').notNull();

export interface LlmMetaRow {
  provider: string;
  model: string | null;
  cacheHit: boolean;
  latencyMs: number | null;
}

export const vendors = pgTable('vendors', {
  id: text('id').primaryKey(),
  orgId: org(),
  data: jsonb('data').$type<Vendor>().notNull(),
});

export const contracts = pgTable(
  'contracts',
  {
    id: text('id').primaryKey(),
    orgId: org(),
    vendorId: text('vendor_id').notNull(),
    data: jsonb('data').$type<Contract>().notNull(),
  },
  (t) => [index('contracts_vendor_idx').on(t.vendorId)],
);

export const documents = pgTable('documents', {
  sha256: text('sha256').primaryKey(),
  orgId: org(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  channel: text('channel').notNull(),
  text: text('text').notNull(),
  bytes: bytea('bytes').notNull(),
});

export const bills = pgTable(
  'bills',
  {
    id: text('id').primaryKey(),
    orgId: org(),
    documentSha: text('document_sha').notNull(),
    channel: text('channel').$type<'pdf' | 'email' | 'chat' | 'portal'>().notNull(),
    receivedAt: text('received_at').notNull(),
    vendorId: text('vendor_id'),
    contractId: text('contract_id'),
    status: text('status').notNull(),
    reading: jsonb('reading').$type<ExtractedBill | null>(),
    readingMeta: jsonb('reading_meta').$type<LlmMetaRow & { error: string | null }>(),
    matches: jsonb('matches').$type<LineMatch[] | null>(),
    matchMeta: jsonb('match_meta').$type<LlmMetaRow & { error: string | null }>(),
    supersedesBillId: text('supersedes_bill_id'),
    chain: jsonb('chain').$type<string[]>().notNull(),
    askedAt: text('asked_at'),
    // bigint: COP totals in minor units outgrow a 32-bit integer
    casePaidMinor: bigint('case_paid_minor', { mode: 'number' }).notNull().default(0),
    datasetId: text('dataset_id'),
  },
  (t) => [
    index('bills_org_idx').on(t.orgId),
    index('bills_vendor_idx').on(t.vendorId),
    // one bill per document: the same bytes never become a second bill
    uniqueIndex('bills_document_idx').on(t.documentSha),
  ],
);

export const decisions = pgTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    orgId: org(),
    billId: text('bill_id').notNull(),
    seq: integer('seq').notNull(),
    at: text('at').notNull(),
    outcome: text('outcome').notNull(),
    data: jsonb('data').$type<Decision>().notNull(),
  },
  (t) => [index('decisions_bill_idx').on(t.billId)],
);

export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    orgId: org(),
    vendorId: text('vendor_id').notNull(),
    data: jsonb('data').$type<EvidenceItem>().notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('evidence_vendor_idx').on(t.vendorId)],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    /** insertion order */
    seq: serial('seq').notNull(),
    orgId: org(),
    billId: text('bill_id').notNull(),
    at: text('at').notNull(),
    sender: text('sender').$type<'agent' | 'vendor' | 'person' | 'system'>().notNull(),
    body: text('body').notNull(),
    attachmentBillId: text('attachment_bill_id'),
  },
  (t) => [index('messages_bill_idx').on(t.billId)],
);

export const portalTokens = pgTable('portal_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  orgId: org(),
  billId: text('bill_id').notNull(),
  vendorId: text('vendor_id').notNull(),
  createdAt: text('created_at').notNull(),
});

export const humanActions = pgTable('human_actions', {
  id: text('id').primaryKey(),
  orgId: org(),
  billId: text('bill_id').notNull(),
  at: text('at').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  note: text('note'),
});

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    orgId: org(),
    /** creation order (the reference RCB-0001 is built from it); payments are read in this order */
    seq: integer('seq').notNull(),
    billId: text('bill_id').notNull(),
    data: jsonb('data').$type<Payment>().notNull(),
    status: text('status').notNull(),
  },
  (t) => [uniqueIndex('payments_seq_idx').on(t.orgId, t.seq)],
);

export const bankLines = pgTable('bank_lines', {
  id: text('id').primaryKey(),
  orgId: org(),
  data: jsonb('data').$type<BankLine>().notNull(),
});

export const timeline = pgTable('timeline', {
  seq: serial('seq').primaryKey(),
  orgId: org(),
  at: text('at').notNull(),
  kind: text('kind').notNull(),
  billId: text('bill_id'),
  text: text('text').notNull(),
});

export const orgState = pgTable('org_state', {
  orgId: text('org_id').primaryKey(),
  now: text('now').notNull(),
  phase: text('phase').notNull(),
});
