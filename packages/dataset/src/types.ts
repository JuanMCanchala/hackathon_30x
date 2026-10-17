import type {
  ExtractedInvoice,
  InvoiceSource,
  Outcome,
  PayeeCategory,
  PayoutMethod,
  RuleId,
} from '@mandato/domain';

export type DocFormat = 'pdf' | 'png' | 'eml' | 'txt';

export type Template =
  'cuenta_cobro_co' | 'factura_co' | 'factura_mx' | 'fatura_br' | 'invoice_us' | 'recibo_pe';

export interface EmailSpec {
  fromName: string;
  fromAddress: string;
  subject: string;
  /** Plain-text body, Spanish or English. */
  body: string;
  /** Attach the rendered bill as a PDF. */
  attachPdf: boolean;
  attachmentName?: string;
}

export interface ChatSpec {
  /** Name as it appears in the WhatsApp export. */
  sender: string;
  messages: { at: string; text: string }[];
}

export interface DocumentSpec {
  format: DocFormat;
  template?: Template;
  /** "photo" renders the bill as a phone picture on a desk. */
  style?: 'clean' | 'photo';
  email?: EmailSpec;
  chat?: ChatSpec;
  /** Extra visual details that are not part of the extracted fields. */
  extras?: {
    issuerAddress?: string;
    issuerPhone?: string;
    notes?: string[];
    /** Text printed in white, 1 px: invisible to people, readable by machines. */
    hiddenText?: string;
    /** A visible note addressed to automated systems. */
    injectedNote?: string;
    billToOverride?: { name: string; taxId: string; address: string };
    signature?: string;
  };
}

export interface ExpectedDecision {
  outcome: Outcome;
  /** Every rule expected to fail (order irrelevant). */
  failing: RuleId[];
  approvalsRequired?: 0 | 1 | 2;
}

export interface DatasetBill {
  /** Stable id, also the file stem: "ago-04", "sep-12", "atk-03", "vivo-01". */
  id: string;
  /** Decision period for scripted months; null for attacks and live files (real clock). */
  period: '2026-08' | '2026-09' | null;
  receivedAt: string;
  source: InvoiceSource;
  /** Path relative to packages/dataset/files. */
  file: string;
  mediaType: string;
  /** Short Spanish title for the UI. */
  title: string;
  /** What this case demonstrates, in Spanish. */
  note: string;
  /** The challenge trap it illustrates, if any (brief §07). */
  trap: string | null;
  /** Ground truth: what a perfect reader extracts. Also the source used to render the file. */
  truth: ExtractedInvoice;
  document: DocumentSpec;
  expected: ExpectedDecision;
}

export interface BillInput {
  type?: ExtractedInvoice['documentType'];
  language: 'es' | 'en' | 'pt';
  issuer: { name: string; taxId: string | null; country: string; email?: string | null };
  billTo?: { name: string | null; taxId: string | null };
  number: string;
  issueDate: string;
  dueDate?: string | null;
  servicePeriod?: string | null;
  currency: string;
  items: {
    description: string;
    quantity?: string | null;
    unitPrice?: string | null;
    amount: string;
  }[];
  taxes?: { name: string; rate?: string | null; amount: string; kind?: 'tax' | 'withholding' }[];
  /** Defaults to Σ items + taxes − withholdings. */
  total?: string;
  words?: { text: string; value: string } | null;
  payout: {
    method: PayoutMethod | null;
    destination: string | null;
    bankName?: string | null;
    accountHolder?: string | null;
  };
  category: PayeeCategory | null;
  description?: string | null;
  instructions?: string | null;
}
