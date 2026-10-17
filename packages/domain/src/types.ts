import type { Currency, FxSnapshot } from './money';
export type { Currency, FxSnapshot };

export type Country = 'CO' | 'MX' | 'BR' | 'US';
export type Rail = 'bre-b' | 'spei' | 'pix' | 'ach';
export type ContractType = 'hourly' | 'milestone' | 'retainer' | 'usage' | 'goods';
export type Outcome = 'PAY' | 'PAY_PART' | 'ASK_VENDOR' | 'ESCALATE' | 'HOLD';
export type BillStatus =
  | 'RECEIVED'
  | 'PAID'
  | 'PART_PAID'
  | 'AWAITING_VENDOR'
  | 'ESCALATED'
  | 'HELD'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED';

export interface Vendor {
  id: string;
  name: string;
  legalName: string;
  country: Country;
  taxId: string;
  email: string;
  contactName: string;
  payout: { rail: Rail; currency: Currency; destination: string; display: string };
}

export type EvidenceRequirement =
  | { type: 'time_entries'; project: string }
  | { type: 'github_pr'; repo: string; number: number }
  | { type: 'deliverable'; deliverableId: string }
  | { type: 'ticket'; key: string }
  | { type: 'usage_report'; meter: string }
  | { type: 'delivery'; orderId: string };

export interface ContractTerm {
  id: string;
  kind: 'hours' | 'milestone' | 'retainer' | 'usage' | 'goods';
  title: string;
  /** per hour (hours), per unit (usage/goods) or the fixed amount (milestone/retainer) */
  unitPriceMinor: number;
  /** null = the signed schedule is enough (retainer) */
  evidence: EvidenceRequirement | null;
}

export interface Contract {
  id: string;
  vendorId: string;
  type: ContractType;
  title: string;
  currency: Currency;
  validFrom: string;
  validTo: string | null; // ISO dates
  terms: ContractTerm[];
  periodCapMinor: number; // per calendar month, contract currency
  netDays: number;
  earlyPayment: { discountBps: number; withinDays: number } | null;
  allowPartial: boolean;
  vendorResponseDays: number;
  evidenceRuleText: string; // Spanish, shown in the UI
}

export type EvidenceKind =
  | 'pr_merged'
  | 'pr_open'
  | 'time_entry'
  | 'ticket_closed'
  | 'ticket_open'
  | 'deliverable_accepted'
  | 'deliverable_pending'
  | 'usage_report'
  | 'delivery_confirmed';

export interface EvidenceItem {
  id: string;
  vendorId: string;
  source: 'github' | 'toggl' | 'linear' | 'entregables' | 'medidor' | 'entregas';
  origin: 'live' | 'fixture' | 'csv';
  kind: EvidenceKind;
  /** time_entry: project · PR: "owner/repo#n" · deliverable id · ticket key · meter · order id */
  ref: string;
  title: string;
  url: string | null;
  occurredAt: string; // ISO datetime
  minutes?: number;
  quantity?: string;
  actor?: string;
}

export interface ExtractedLine {
  description: string;
  quantity: string | null;
  unit: 'hour' | 'unit' | 'milestone' | 'month' | 'other';
  unitPrice: string | null;
  amount: string | null; // canonical decimals "1234.50"
}

export interface ExtractedBill {
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  currency: string | null;
  total: string | null;
  lines: ExtractedLine[];
  payoutDetails: string | null; // any bank account / key / payment instruction, verbatim
  revisionOf: string | null; // invoice number this bill says it corrects
  instructionsToAgent: boolean; // text addressed to an automated system
  confidence: {
    vendor: number;
    invoiceNumber: number;
    total: number;
    lines: number;
    currency: number;
    dates: number;
  };
}

export interface LineMatch {
  lineIndex: number;
  termId: string | null;
  confidence: number;
  reason: string;
}

export interface Policy {
  minReadingConfidence: number;
  minMatchConfidence: number;
  autoPayLimitUsdMinor: number;
}
export const DEFAULT_POLICY: Policy = {
  minReadingConfidence: 0.85,
  minMatchConfidence: 0.8,
  autoPayLimitUsdMinor: 2_000_000,
};

export interface HistoryBill {
  billId: string;
  vendorId: string;
  contractId: string | null;
  invoiceNumberNormalized: string | null;
  status: BillStatus;
  paidMinor: number;
  currency: Currency | null;
  periodFrom: string | null;
  periodTo: string | null;
  termIds: string[];
  /** ids of the bill and every bill it supersedes, transitively */
  chain: string[];
}

export interface DecisionContext {
  now: string;
  policy: Policy;
  fx: FxSnapshot;
  bill: {
    id: string;
    reading: ExtractedBill | null;
    readingError: string | null;
    /** text we could read ourselves (PDF text layer, e-mail body, chat, vendor message) */
    documentText: string | null;
    receivedAt: string;
    channel: 'pdf' | 'email' | 'chat' | 'portal';
    chain: string[]; // this bill + bills it supersedes
  };
  vendors: Vendor[];
  contracts: Contract[];
  matches: LineMatch[] | null;
  matchError: string | null;
  evidence: EvidenceItem[]; // every evidence item of the resolved vendor
  history: HistoryBill[]; // every other bill of the organization
  case: { paidMinor: number; askedAt: string | null };
}

export type CheckId =
  | 'reading.available'
  | 'reading.confidence'
  | 'reading.instructions'
  | 'reading.arithmetic'
  | 'reading.period'
  | 'vendor.registered'
  | 'vendor.payout'
  | 'contract.active'
  | 'contract.currency'
  | 'duplicate.invoice'
  | 'duplicate.work'
  | 'match.confidence'
  | 'terms.lines'
  | 'terms.price'
  | 'terms.cap'
  | 'policy.limit'
  | 'evidence.coverage'
  | 'vendor.deadline';

export interface CheckResult {
  id: CheckId;
  stage: 'lectura' | 'proveedor' | 'duplicado' | 'contrato' | 'evidencia' | 'plazo';
  status: 'pass' | 'fail' | 'not_run';
  onFail: Outcome;
  label: string;
  detail: string;
  remedy: string | null; // Spanish
}

export interface LineEvaluation {
  lineIndex: number;
  description: string;
  termId: string | null;
  termTitle: string | null;
  billedMinor: number;
  evidencedMinor: number;
  billedQuantity: string | null;
  evidencedQuantity: string | null;
  status: 'evidenced' | 'partial' | 'missing' | 'not_required' | 'unmatched';
  evidence: EvidenceItem[]; // items that count
  supporting: EvidenceItem[]; // shown but not counted (e.g. merged PRs behind hours)
}

export interface Decision {
  outcome: Outcome;
  vendorId: string | null;
  contractId: string | null;
  currency: Currency | null;
  billedMinor: number;
  evidencedMinor: number;
  alreadyPaidMinor: number;
  payNowMinor: number;
  askMinor: number;
  checks: CheckResult[];
  lines: LineEvaluation[];
  summary: string;
  counterfactual: string[];
  vendorMessage: string | null;
  engineVersion: string;
}
