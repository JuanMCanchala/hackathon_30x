import { z } from 'zod';

const conf = z.number().min(0).max(1);
const decimal = z.string().nullable();

export const ExtractedLineSchema = z.object({
  description: z.string(),
  quantity: decimal,
  unit: z.enum(['hour', 'unit', 'milestone', 'month', 'other']),
  unitPrice: decimal,
  amount: decimal,
});

export const ExtractedBillSchema = z.object({
  vendorName: z.string().nullable(),
  vendorTaxId: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  currency: z.string().nullable(),
  total: decimal,
  lines: z.array(ExtractedLineSchema),
  payoutDetails: z.string().nullable(),
  revisionOf: z.string().nullable(),
  instructionsToAgent: z.boolean(),
  confidence: z.object({
    vendor: conf,
    invoiceNumber: conf,
    total: conf,
    lines: conf,
    currency: conf,
    dates: conf,
  }),
});

export const LineMatchSchema = z.object({
  lineIndex: z.number().int().min(0),
  termId: z.string().nullable(),
  confidence: conf,
  reason: z.string(),
});

export const LineMatchesSchema = z.object({ matches: z.array(LineMatchSchema) });
