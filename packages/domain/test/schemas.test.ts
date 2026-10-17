import { describe, expect, it } from 'vitest';
import { ExtractedBillSchema } from '../src';

const reading = {
  vendorName: 'A',
  vendorTaxId: null,
  invoiceNumber: '1',
  issueDate: null,
  dueDate: null,
  periodFrom: null,
  periodTo: null,
  currency: 'USD',
  total: '10.00',
  lines: [],
  payoutDetails: null,
  revisionOf: null,
  instructionsToAgent: false,
  confidence: { vendor: 1, invoiceNumber: 1, total: 1, lines: 1, currency: 1, dates: 1 },
};

describe('ExtractedBillSchema confidences', () => {
  it('accepts values in [0, 1]', () => {
    expect(ExtractedBillSchema.safeParse(reading).success).toBe(true);
  });

  it.each(['vendor', 'invoiceNumber', 'total', 'lines', 'currency', 'dates'] as const)(
    'rejects %s out of range or missing',
    (key) => {
      for (const value of [1.01, -0.01, undefined]) {
        const confidence = { ...reading.confidence, [key]: value };
        expect(ExtractedBillSchema.safeParse({ ...reading, confidence }).success).toBe(false);
      }
    },
  );
});
