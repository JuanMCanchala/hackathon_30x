/**
 * Response shapes of the Recibido API (apps/api/src/services/views.ts and reconciliation.ts),
 * built from the domain types so the two cannot drift silently.
 */
import type {
  BankLine,
  BillStatus,
  CheckResult,
  Contract,
  Currency,
  EvidenceItem,
  ExtractedBill,
  LineEvaluation,
  LineMatch,
  MatchStatus,
  Outcome,
  Payment,
  Scorecard,
  Vendor,
  Violation,
} from '@recibido/domain';

export type { BillStatus, Currency, EvidenceItem, Outcome };

export type PublicVendor = Omit<Vendor, 'payout'> & {
  payout: Omit<Vendor['payout'], 'destination'>;
};
export type PublicPayment = Omit<Payment, 'destination'> & { destinationDisplay: string };

export type Phase = 'idle' | 'september' | 'arriving' | 'october' | 'closed';

export interface TimelineEntry {
  seq: number;
  at: string;
  kind: string;
  billId: string | null;
  text: string;
}

export interface Overview {
  clock: { now: string | null; phase: Phase };
  scorecard: Scorecard;
  violations: Violation[];
  byStatus: Record<BillStatus, number>;
  timeline: TimelineEntry[];
}

export interface BillListItem {
  id: string;
  datasetId: string | null;
  receivedAt: string;
  channel: string;
  vendorId: string | null;
  vendorName: string | null;
  invoiceNumber: string | null;
  total: string | null;
  currency: string | null;
  status: BillStatus;
  statusLabel: string;
  outcome: Outcome | null;
  outcomeLabel: string | null;
  summary: string | null;
  amounts: { currency: Currency | null; billedMinor: number; evidencedMinor: number } | null;
  supersedesBillId: string | null;
  casePaidMinor: number;
}

export interface Message {
  id: string;
  seq: number;
  billId: string;
  at: string;
  sender: 'agent' | 'vendor' | 'person' | 'system';
  body: string;
  attachmentBillId: string | null;
}

export interface HumanAction {
  id: string;
  billId: string;
  at: string;
  actor: string;
  action: string;
  note: string | null;
}

export interface BillReceipt {
  bill: {
    id: string;
    datasetId: string | null;
    status: BillStatus;
    statusLabel: string;
    channel: string;
    receivedAt: string;
    document: { filename: string; channel: string } | null;
    supersedesBillId: string | null;
    casePaidMinor: number;
    askedAt: string | null;
  };
  vendor: PublicVendor | null;
  contract: Contract | null;
  reading: ExtractedBill | null;
  readingMeta: Record<string, unknown> | null;
  matches: LineMatch[] | null;
  matchMeta: Record<string, unknown> | null;
  outcome: Outcome | null;
  outcomeLabel: string | null;
  summary: string | null;
  counterfactual: string[];
  vendorMessage: string | null;
  checks: CheckResult[];
  lines: LineEvaluation[];
  amounts: {
    currency: Currency | null;
    billedMinor: number;
    evidencedMinor: number;
    alreadyPaidMinor: number;
    payNowMinor: number;
    askMinor: number;
  } | null;
  engineVersion: string | null;
  decisions: {
    id: string;
    seq: number;
    at: string;
    outcome: Outcome;
    outcomeLabel: string;
    summary: string;
    payNowMinor: number;
  }[];
  payments: PublicPayment[];
  messages: Message[];
  humanActions: HumanAction[];
  chain: {
    id: string;
    datasetId: string | null;
    status: BillStatus | null;
    statusLabel: string | null;
    receivedAt: string | null;
  }[];
  headBillId: string;
}

export type VendorView = PublicVendor & {
  contracts: Contract[];
  bills: number;
  paid: Partial<Record<Currency, number>>;
};

export interface Conversation {
  billId: string;
  datasetId: string | null;
  vendorId: string | null;
  vendorName: string | null;
  contactName: string | null;
  status: BillStatus;
  statusLabel: string;
  open: boolean;
  lastAt: string;
  messages: Message[];
  portalToken: string | null;
}

export interface ReconciliationRow {
  line: BankLine;
  status: MatchStatus;
  fxDiffUsdMinor: number;
  note: string | null;
  payment: PublicPayment | null;
  bill: {
    id: string;
    datasetId: string | null;
    status: BillStatus;
    statusLabel: string;
    invoiceNumber: string | null;
    total: string | null;
    currency: string | null;
  } | null;
  contract: { id: string; title: string; type: string; evidenceRuleText: string } | null;
  evidence: EvidenceItem[];
}

export interface Reconciliation {
  rows: ReconciliationRow[];
  unmatchedPayments: PublicPayment[];
  totals: {
    lines: number;
    matched: number;
    matchedFx: number;
    fees: number;
    returned: number;
    unmatched: number;
    fxDiffUsdMinor: number;
    debitsUsdMinor: number;
  };
}

export type TourAction =
  'arrive-october' | 'reply-daniela' | 'accept-brand-kit' | 'merge-pr' | 'close-october';

export interface TourState {
  phase: Phase;
  busy: boolean;
  now: string;
  actions: { id: TourAction; label: string; available: boolean; done: boolean }[];
  livePr: { url: string; live: boolean };
  problems: string[];
}

/** What the contractor sees on the portal (apps/api/src/services/vendor-loop.ts). */
export interface PortalView {
  bill: {
    id: string;
    status: BillStatus;
    statusLabel: string;
    invoiceNumber: string | null;
    issueDate: string | null;
    currency: string | null;
    total: string | null;
    receivedAt: string;
  };
  vendor: { name: string; contactName: string };
  messages: { at: string; sender: 'agent' | 'vendor'; body: string }[];
  missing: { description: string; billed: string; evidenced: string; status: string }[];
  askAmount: string | null;
  canReply: boolean;
}
