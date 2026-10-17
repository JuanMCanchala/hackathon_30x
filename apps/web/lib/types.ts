/** Shapes returned by the Mandato API (see apps/api/src/services/views.ts). */
import type {
  AuditReport,
  DecisionFacts,
  ExtractedInvoice,
  InvoiceStatus,
  Mandate,
  MandateProposalDraft,
  Outcome,
  Payee,
  PayoutMethod,
  PolicyTerms,
  Requester,
  RuleMeta,
  RuleResult,
  Signal,
} from '@mandato/domain';

export type { Outcome, InvoiceStatus, RuleResult, Mandate, Payee, PolicyTerms, RuleMeta };

export interface SessionUser {
  id: string;
  orgId: string;
  name: string;
  title: string;
  canApprove: boolean;
  canSign: boolean;
}

export interface Session {
  user: SessionUser;
  users: { id: string; name: string; title: string; canApprove: boolean; canSign: boolean }[];
  demoMode: boolean;
  reader: {
    name: string;
    live: boolean;
    provider: 'anthropic' | 'fireworks' | null;
    model: string | null;
  };
  policyCompiler: boolean;
}

export interface InvoiceListItem {
  id: string;
  ref: string;
  title: string | null;
  source: string;
  datasetId: string | null;
  status: InvoiceStatus;
  outcome: Outcome | null;
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
  payment: { status: 'scheduled' | 'sent' | 'settled'; scheduledFor: string } | null;
}

export interface ApprovalEntry {
  userId: string;
  name: string;
  title: string;
  action: 'approve' | 'reject';
  note: string | null;
  via: 'web' | 'link';
  at: string;
}

export interface RadarItem {
  invoiceId: string;
  ref: string;
  title: string | null;
  payeeName: string;
  receivedAt: string;
  signals: Signal[];
}

export interface PaymentView {
  id: string;
  invoiceId: string;
  ref: string;
  title: string | null;
  payeeName: string;
  rail: PayoutMethod;
  railName: string;
  destination: string;
  currency: string;
  amountMinor: number;
  usdCents: number | null;
  scheduledFor: string;
  status: 'scheduled' | 'sent' | 'settled';
  reference: string | null;
  expectedSettlement: string | null;
  sentAt: string | null;
  settledAt: string | null;
}

export interface PaymentsResponse {
  today: string;
  items: PaymentView[];
  treasury: Treasury;
}

/** One cash picture for every screen: in the account today, and free for new payments. */
export interface Treasury {
  openingUsdCents: number;
  sentUsdCents: number;
  balanceUsdCents: number;
  scheduledUsdCents: number;
  availableUsdCents: number;
}

export interface InvoiceDetail {
  id: string;
  ref: string;
  title: string | null;
  source: string;
  datasetId: string | null;
  requester: Requester;
  receivedAt: string;
  decidedAt: string | null;
  resolvedAt: string | null;
  status: InvoiceStatus;
  outcome: Outcome | null;
  periodKey: string;
  issuerName: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  servicePeriod: string | null;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  payee: Payee | null;
  document: {
    id: string;
    filename: string;
    mediaType: string;
    kind: string | null;
    size: number;
    sha256: string;
  } | null;
  extraction: ExtractedInvoice | null;
  extractionMeta: {
    provider: string;
    model: string | null;
    cacheHit: boolean;
    latencyMs: number | null;
    error: string | null;
    scanPhrases: string[];
  };
  decision: {
    outcome: Outcome;
    approvalsRequired: number;
    results: RuleResult[];
    summary: string;
    counterfactual: string[];
    facts: DecisionFacts;
    policyVersion: number;
    mandateId: string | null;
    engineVersion: string;
    decidedAt: string;
  } | null;
  mandate: Mandate | null;
  approval: {
    requestId: string;
    required: number;
    status: 'pending' | 'approved' | 'rejected';
    approvals: ApprovalEntry[];
    approvers: { id: string; name: string; title: string }[];
  } | null;
  proposal: {
    id: string;
    status: 'pending' | 'accepted' | 'rejected';
    title: string;
    draft: MandateProposalDraft;
    impact: { avoidedEscalations: number };
    resolvedBy: string | null;
    resolutionNote: string | null;
  } | null;
  payment: PaymentView | null;
  signals: Signal[];
  ledger: {
    seq: number;
    type: string;
    at: string;
    actor: { kind: string; id: string; name: string };
    hash: string;
    prevHash: string;
  }[];
}

export interface Overview {
  organization: { id: string; name: string; legalName: string };
  now: string;
  currentPeriod: string;
  policyVersion: number;
  budgetUsdCents: number;
  autonomousLimitUsdCents: number;
  periods: {
    periodKey: string;
    total: number;
    paidByAgent: number;
    heldByAgent: number;
    escalated: number;
    approved: number;
    rejected: number;
    pending: number;
    autonomy: number;
    committedUsdCents: number;
    budgetUsdCents: number;
    remainingUsdCents: number;
  }[];
  treasury: Treasury;
  pendingApprovals: number;
  pendingProposals: number;
  signedProposals: number;
  latestAudit: {
    id: string;
    at: string;
    ok: boolean;
    violations: number;
    paymentsChecked: number;
    decisionsChecked: number;
    chainIntact: boolean;
  } | null;
  ladder: {
    periodKey: string;
    autonomy: number;
    total: number;
    paidByAgent: number;
    heldByAgent: number;
    escalated: number;
    inProgress: boolean;
    signedInPeriod: number;
  }[];
  recent: InvoiceListItem[];
}

export interface ProposalView {
  id: string;
  status: 'pending' | 'accepted' | 'rejected';
  invoiceId: string;
  invoiceRef: string;
  invoiceTitle: string | null;
  draft: MandateProposalDraft;
  impact: { avoidedEscalations: number };
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  resultMandateId: string | null;
}

export interface PayeeView extends Payee {
  createdAt: string;
  updatedAt: string;
  mandate: Mandate | null;
  mandateVersions: number;
  stats: { paid: number; escalated: number; usdCents: number };
}

export interface MandateView extends Mandate {
  payeeName: string;
}

export interface PolicyView {
  version: number;
  terms: PolicyTerms;
  note: string | null;
  createdAt: string;
  createdBy: string;
  versions: { version: number; note: string | null; createdAt: string; createdBy: string }[];
}

export interface PolicyPreview {
  evaluated: number;
  changes: {
    invoiceId: string;
    ref: string;
    title: string | null;
    periodKey: string;
    from: Outcome;
    to: Outcome;
    reason: string;
  }[];
  becomesPay: number;
  becomesEscalate: number;
  becomesHold: number;
  policyChanges: { label: string; from: string; to: string }[];
}

export interface AuditRun {
  id: string;
  createdAt: string;
  report: AuditReport;
}

export interface LedgerRow {
  seq: number;
  orgId: string;
  type: string;
  entityId: string | null;
  actor: { kind: string; id: string; name: string };
  payload: unknown;
  at: string;
  prevHash: string;
  hash: string;
}

export interface CatalogBill {
  id: string;
  title: string;
  note: string;
  trap: string | null;
  format: 'pdf' | 'png' | 'eml' | 'txt';
  file: string;
  receivedAt: string;
  expected: { outcome: Outcome; failing: string[] };
  invoice: { id: string; outcome: Outcome | null; status: InvoiceStatus; ref: string } | null;
}

export interface Catalog {
  seeded: boolean;
  months: { period: string; label: string; bills: CatalogBill[]; actions: number }[];
  live: CatalogBill[];
  attacks: {
    id: string;
    title: string;
    attempt: string;
    caughtBy: string;
    bills: CatalogBill[];
    agentRequest: { agentId: string } | null;
    agentInvoice: {
      id: string;
      outcome: Outcome | null;
      status: InvoiceStatus;
      ref: string;
    } | null;
  }[];
}

export interface AgentView {
  id: string;
  name: string;
  description: string;
  scope: { categories: string[]; maxPerRequestUsdCents: number };
  status: string;
  createdAt: string;
}

export interface EmailView {
  kind: 'email';
  from: string;
  to: string;
  subject: string;
  date: string | null;
  text: string;
  attachments: {
    index: number;
    filename: string;
    mediaType: string;
    size: number;
    /** PDF attachments: how many pages can be shown as images (0 when they cannot). */
    pages?: number;
  }[];
}

export interface PdfView {
  kind: 'pdf';
  /** Pages that can be shown as images; 0 when the server cannot render them. */
  pages: number;
}

export interface ChatView {
  kind: 'chat';
  messages: { at: string | null; sender: string | null; text: string }[];
}
