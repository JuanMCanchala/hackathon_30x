import type { InstructionScan } from './scan';
import type {
  AgentScope,
  ExtractedInvoice,
  Mandate,
  Payee,
  PayeeCategory,
  PayoutDestination,
  PolicyTerms,
} from './schemas';

export type Outcome = 'PAY' | 'HOLD' | 'ESCALATE';

/** PAID = scheduled by the agent; APPROVED = scheduled after human approval. No money moves. */
export type InvoiceStatus =
  'RECEIVED' | 'PAID' | 'HELD' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type InvoiceSource = 'upload' | 'email' | 'chat' | 'agent' | 'dataset' | 'attack';

export type RuleStage = 'reading' | 'payee' | 'duplicate' | 'mandate' | 'policy' | 'requester';

export type RuleId =
  | 'reading.document_type'
  | 'reading.required_fields'
  | 'reading.confidence'
  | 'reading.arithmetic'
  | 'reading.amount_in_words'
  | 'reading.addressed_to_us'
  | 'reading.no_agent_instructions'
  | 'dates.valid'
  | 'payee.known'
  | 'payee.active'
  | 'payee.destination_matches'
  | 'duplicate.invoice_number'
  | 'duplicate.same_amount_recent'
  | 'mandate.exists'
  | 'mandate.currency'
  | 'mandate.amount'
  | 'mandate.frequency'
  | 'mandate.period_cap'
  | 'policy.currency_allowed'
  | 'policy.autonomous_limit'
  | 'policy.period_budget'
  | 'treasury.balance'
  | 'requester.scope';

export interface OrganizationProfile {
  id: string;
  name: string;
  legalName: string;
  taxId: string;
  /** Other names the company is billed as ("Andes Labs", "Andes Labs Inc."). */
  aliases: string[];
  timeZone: string;
}

export type Requester =
  | { kind: 'user'; userId: string; name: string }
  | { kind: 'system'; name: string }
  | { kind: 'agent'; agentId: string; name: string; scope: AgentScope };

/** A previous bill of the organization, as far as the engine needs to know it. */
export interface HistoryInvoice {
  invoiceId: string;
  ref: string;
  /** Registered payee, or null when the issuer was not recognised. */
  payeeId: string | null;
  /** Issuer identity as written on the bill, normalized, to match bills across registrations. */
  issuerTaxIdNorm: string | null;
  issuerNameFolded: string | null;
  destinationNorm: string | null;
  invoiceNumber: string | null;
  invoiceNumberNorm: string | null;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  issueDate: string | null;
  servicePeriod: string | null;
  /** Budget period (YYYY-MM) in which the bill was decided. */
  periodKey: string;
  status: InvoiceStatus;
  decidedAt: string;
}

export interface DecisionContext {
  /** Decision instant (ISO 8601). The engine never reads the clock itself. */
  now: string;
  organization: OrganizationProfile;
  invoice: {
    extraction: ExtractedInvoice | null;
    /** Why the reader could not produce an extraction (unreadable, schema violation…). */
    extractionError: string | null;
    source: InvoiceSource;
    /** Deterministic instruction scan over every text we could read ourselves. */
    instructionScan: InstructionScan;
  };
  policy: { version: number; terms: PolicyTerms };
  payees: Payee[];
  /** Mandates of the organization; the engine selects the active one for the payee. */
  mandates: Mandate[];
  /** Prior bills of the organization (the bill being decided must not be included). */
  history: HistoryInvoice[];
  treasury: { availableUsdCents: number };
  requester: Requester;
}

export type PayeeMatch =
  | { status: 'matched'; payee: Payee; by: 'tax_id' | 'destination' | 'tax_id_and_destination' }
  | { status: 'conflict'; byTaxId: Payee; byDestination: Payee }
  | { status: 'unknown'; similar: { payee: Payee; score: number; confusable: boolean } | null };

/** Facts derived once and shared by all rules; stored with the decision for the auditor. */
export interface DecisionFacts {
  periodKey: string;
  decisionDate: string;
  amountMinor: number | null;
  currency: string | null;
  usdCents: number | null;
  invoiceNumber: string | null;
  invoiceNumberNorm: string | null;
  issueDate: string | null;
  dueDate: string | null;
  dueDateDefaulted: boolean;
  servicePeriod: string | null;
  issuerName: string | null;
  issuerTaxIdNorm: string | null;
  issuerNameFolded: string | null;
  /** Normalized destination written on the bill (or the registered one when the bill has none). */
  destinationNorm: string | null;
  payeeMatch: PayeeMatch['status'];
  payeeMatchedBy: string | null;
  payeeId: string | null;
  payeeName: string | null;
  payeeCategory: PayeeCategory | null;
  /** Destination the payment would go to (registered one), when a payee is known. */
  destination: PayoutDestination | null;
  /** Destination written on the bill, if any. */
  invoiceDestination: string | null;
  mandateId: string | null;
  mandateKey: string | null;
  mandateVersion: number | null;
  /** Lowest confidence among the critical fields that are present. */
  minConfidence: number | null;
  agentInstructionsDetected: boolean;
  committedUsdCentsBefore: number;
  monthlyBudgetUsdCents: number;
  payeeMonthCountBefore: number;
  payeeMonthAmountMinorBefore: number;
  availableUsdCents: number;
}

export interface RuleResult {
  id: RuleId;
  stage: RuleStage;
  /** Spanish title shown in receipts. */
  title: string;
  status: 'pass' | 'fail' | 'skip';
  /** Only meaningful for skips: a safe skip does not block PAY (ADR-0003). */
  safeSkip: boolean;
  onFail: Exclude<Outcome, 'PAY'>;
  observed: string | null;
  expected: string | null;
  /** What happened, in one Spanish sentence. */
  detail: string;
  /** For failures: the condition that would have made this rule pass. */
  remedy: string | null;
  /** Whether a human-approved failure of this rule can be turned into a mandate proposal. */
  teachable: boolean;
}

export interface Decision {
  outcome: Outcome;
  results: RuleResult[];
  summary: string;
  counterfactual: string[];
  approvalsRequired: 0 | 1 | 2;
  facts: DecisionFacts;
  engineVersion: string;
}
