import { z } from 'zod';

/** ISO 4217 alphabetic code, upper case. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code');

/** Calendar date as YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** Canonical decimal string: digits, optional dot and decimals, no thousands separators. */
export const DecimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'canonical decimal');

export const PayoutMethod = z.enum(['bre_b', 'spei', 'pix', 'ach', 'wire', 'card', 'other']);
export type PayoutMethod = z.infer<typeof PayoutMethod>;

export const PayeeCategory = z.enum([
  'contractor',
  'software',
  'services',
  'facilities',
  'travel',
  'other',
]);
export type PayeeCategory = z.infer<typeof PayeeCategory>;

export const DocumentType = z.enum([
  'invoice',
  'cuenta_de_cobro',
  'credit_note',
  'receipt',
  'not_an_invoice',
  'unknown',
]);
export type DocumentType = z.infer<typeof DocumentType>;

const Confidence = z.number().min(0).max(1);

/**
 * What the reader (LLM or a structured agent request) extracts from a bill.
 * Everything is nullable: the reader must say "I could not find it" rather than guess.
 */
export const ExtractedInvoiceSchema = z.object({
  documentType: DocumentType,
  language: z.string().nullable(),
  issuer: z.object({
    name: z.string().nullable(),
    taxId: z.string().nullable(),
    country: z.string().nullable(),
    email: z.string().nullable(),
  }),
  billTo: z.object({
    name: z.string().nullable(),
    taxId: z.string().nullable(),
  }),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  /** Service period the bill covers, as YYYY-MM, when stated. */
  servicePeriod: z.string().nullable(),
  currency: z.string().nullable(),
  total: z.string().nullable(),
  subtotal: z.string().nullable(),
  amountInWords: z.string().nullable(),
  /** The amount written in words, converted to a canonical decimal by the reader. */
  amountInWordsValue: z.string().nullable(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.string().nullable(),
      unitPrice: z.string().nullable(),
      amount: z.string(),
    }),
  ),
  taxes: z.array(
    z.object({
      name: z.string(),
      rate: z.string().nullable(),
      amount: z.string(),
      kind: z.enum(['tax', 'withholding']),
    }),
  ),
  payout: z.object({
    method: PayoutMethod.nullable(),
    destination: z.string().nullable(),
    bankName: z.string().nullable(),
    accountHolder: z.string().nullable(),
  }),
  category: PayeeCategory.nullable(),
  description: z.string().nullable(),
  agentInstructions: z.object({
    detected: z.boolean(),
    quote: z.string().nullable(),
  }),
  confidence: z.object({
    issuer: Confidence,
    invoiceNumber: Confidence,
    issueDate: Confidence,
    dueDate: Confidence,
    currency: Confidence,
    total: Confidence,
    payout: Confidence,
  }),
  warnings: z.array(z.string()),
});
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;

export const FxSnapshotSchema = z.object({
  asOf: IsoDate,
  source: z.string(),
  /** Units of each currency per 1 USD, as canonical decimal strings ("4000", "18.50"). */
  unitsPerUsd: z.record(z.string(), DecimalString),
});
export type FxSnapshot = z.infer<typeof FxSnapshotSchema>;

/** Global payment policy. Every change creates a new immutable version. */
export const PolicyTermsSchema = z
  .object({
    allowedCurrencies: z.array(CurrencyCode).min(1),
    autonomousLimitUsdCents: z.number().int().nonnegative(),
    dualApprovalAboveUsdCents: z.number().int().nonnegative(),
    monthlyBudgetUsdCents: z.number().int().nonnegative(),
    minExtractionConfidence: z.number().min(0).max(1),
    duplicateWindowDays: z.number().int().min(0).max(365),
    maxInvoiceAgeDays: z.number().int().min(1).max(3650),
    defaultPaymentTermsDays: z.number().int().min(0).max(180),
    fx: FxSnapshotSchema,
  })
  .refine((p) => p.allowedCurrencies.every((c) => c in p.fx.unitsPerUsd), {
    message: 'Every allowed currency needs an FX rate',
    path: ['fx'],
  });
export type PolicyTerms = z.infer<typeof PolicyTermsSchema>;

export const PayoutDestinationSchema = z.object({
  method: PayoutMethod,
  value: z.string().min(1),
  bankName: z.string().nullable(),
});
export type PayoutDestination = z.infer<typeof PayoutDestinationSchema>;

export const PayeeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  legalName: z.string().min(1),
  country: z.string().length(2),
  taxId: z.string().nullable(),
  category: PayeeCategory,
  currency: CurrencyCode,
  destination: PayoutDestinationSchema,
  status: z.enum(['active', 'blocked']),
});
export type Payee = z.infer<typeof PayeeSchema>;

export const MandateAmountSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fixed'),
    amountMinor: z.number().int().positive(),
    tolerancePct: z.number().min(0).max(100),
  }),
  z.object({
    kind: z.literal('up_to'),
    maxMinor: z.number().int().positive(),
  }),
]);
export type MandateAmount = z.infer<typeof MandateAmountSchema>;

export const MandateTermsSchema = z.object({
  currency: CurrencyCode,
  amount: MandateAmountSchema,
  /** Maximum total per calendar month, in the mandate currency. */
  periodCapMinor: z.number().int().positive(),
  maxInvoicesPerPeriod: z.number().int().min(1).max(31),
  /** Signed exception above the global per-payment limit, in USD cents. */
  autonomousLimitOverrideUsdCents: z.number().int().positive().nullable(),
  validFrom: IsoDate,
  validUntil: IsoDate.nullable(),
  note: z.string().nullable(),
});
export type MandateTerms = z.infer<typeof MandateTermsSchema>;

export const SignatureSchema = z.object({
  userId: z.string(),
  name: z.string(),
  at: z.string(),
});
export type Signature = z.infer<typeof SignatureSchema>;

export const MandateSchema = z.object({
  id: z.string(),
  /** Stable identity across versions. */
  key: z.string(),
  version: z.number().int().positive(),
  payeeId: z.string(),
  status: z.enum(['active', 'superseded', 'revoked']),
  terms: MandateTermsSchema,
  signedBy: z.array(SignatureSchema).min(1),
  source: z.enum(['seed', 'manual', 'proposal']),
  signedAt: z.string(),
});
export type Mandate = z.infer<typeof MandateSchema>;

export const AgentScopeSchema = z.object({
  categories: z.array(PayeeCategory).min(1),
  maxPerRequestUsdCents: z.number().int().positive(),
});
export type AgentScope = z.infer<typeof AgentScopeSchema>;
