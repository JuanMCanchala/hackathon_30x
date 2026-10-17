import { minorToDecimal, parseDecimalToMinor, type ExtractedInvoice } from '@mandato/domain';
import { ORGANIZATION } from './company';
import type { BillInput } from './types';

function sum(values: string[], currency: string): number {
  return values.reduce((acc, v) => {
    const minor = parseDecimalToMinor(v, currency);
    if (minor === null) throw new Error(`invalid amount ${v}`);
    return acc + minor;
  }, 0);
}

/** Builds the ground-truth extraction of a bill (what a perfect reader would return). */
export function bill(input: BillInput): ExtractedInvoice {
  const taxes = (input.taxes ?? []).map((t) => ({
    name: t.name,
    rate: t.rate ?? null,
    amount: t.amount,
    kind: t.kind ?? ('tax' as const),
  }));
  const subtotalMinor = sum(
    input.items.map((i) => i.amount),
    input.currency,
  );
  const taxMinor = taxes.reduce((acc, t) => {
    const v = parseDecimalToMinor(t.amount, input.currency) ?? 0;
    return acc + (t.kind === 'withholding' ? -v : v);
  }, 0);
  const total = input.total ?? minorToDecimal(subtotalMinor + taxMinor, input.currency);
  return {
    documentType: input.type ?? 'invoice',
    language: input.language,
    issuer: {
      name: input.issuer.name,
      taxId: input.issuer.taxId,
      country: input.issuer.country,
      email: input.issuer.email ?? null,
    },
    billTo: input.billTo ?? { name: ORGANIZATION.legalName, taxId: ORGANIZATION.taxId },
    invoiceNumber: input.number,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    servicePeriod: input.servicePeriod ?? input.issueDate.slice(0, 7),
    currency: input.currency,
    total,
    subtotal: input.items.length ? minorToDecimal(subtotalMinor, input.currency) : null,
    amountInWords: input.words?.text ?? null,
    amountInWordsValue: input.words?.value ?? null,
    lineItems: input.items.map((i) => ({
      description: i.description,
      quantity: i.quantity ?? null,
      unitPrice: i.unitPrice ?? null,
      amount: i.amount,
    })),
    taxes,
    payout: {
      method: input.payout.method,
      destination: input.payout.destination,
      bankName: input.payout.bankName ?? null,
      accountHolder: input.payout.accountHolder ?? null,
    },
    category: input.category,
    description: input.description ?? input.items[0]?.description ?? null,
    agentInstructions: {
      detected: Boolean(input.instructions),
      quote: input.instructions ?? null,
    },
    confidence: {
      issuer: 1,
      invoiceNumber: 1,
      issueDate: 1,
      dueDate: 1,
      currency: 1,
      total: 1,
      payout: 1,
    },
    warnings: [],
  };
}
