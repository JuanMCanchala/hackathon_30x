/**
 * Reading accuracy on the fields a decision depends on, model reading vs the dataset's truth.
 * Shared by the eval (replay mode) and the recording script.
 */
import {
  normalizeDestination,
  normalizeInvoiceNumber,
  normalizeTaxId,
  parseDecimalToMinor,
  type Currency,
  type ExtractedBill,
} from '@recibido/domain';

export const CRITICAL_FIELDS = [
  'vendorTaxId',
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'period',
  'currency',
  'total',
  'lines',
  'payoutDetails',
  'revisionOf',
  'instructionsToAgent',
] as const;

const CURRENCIES = new Set(['USD', 'COP', 'MXN', 'BRL']);

function critical(x: ExtractedBill, currency: Currency) {
  const minor = (v: string | null) => parseDecimalToMinor(v, currency);
  return {
    vendorTaxId: x.vendorTaxId && normalizeTaxId(x.vendorTaxId),
    invoiceNumber: x.invoiceNumber && normalizeInvoiceNumber(x.invoiceNumber),
    issueDate: x.issueDate,
    dueDate: x.dueDate,
    period: `${x.periodFrom}..${x.periodTo}`,
    currency: x.currency?.toUpperCase() ?? null,
    total: minor(x.total),
    // count, units, quantities and amounts; descriptions are free text
    lines: x.lines
      .map(
        (l) => `${l.quantity === null ? '-' : Number(l.quantity)} ${l.unit} × ${minor(l.amount)}`,
      )
      .join(' | '),
    payoutDetails: x.payoutDetails && normalizeDestination(x.payoutDetails),
    revisionOf: x.revisionOf && normalizeInvoiceNumber(x.revisionOf),
    instructionsToAgent: x.instructionsToAgent,
  };
}

export const NO_READING = 'no reading';

/** One entry per critical field that differs from the truth; [NO_READING] without a reading. */
export function readingErrors(truth: ExtractedBill, got: ExtractedBill | null): string[] {
  if (!got) return [NO_READING];
  // amounts are compared in the truth's currency, so a misread currency is one error, not many
  const currency = (CURRENCIES.has(truth.currency ?? '') ? truth.currency : 'USD') as Currency;
  const t = critical(truth, currency);
  const g = critical(got, currency);
  // the payout field is verbatim text: it is right when it carries the whole truth (normalized),
  // possibly with surrounding words; part of an account is wrong
  const same = (k: (typeof CRITICAL_FIELDS)[number]) =>
    k === 'payoutDetails' && t.payoutDetails && g.payoutDetails
      ? g.payoutDetails.includes(t.payoutDetails)
      : t[k] === g[k];
  return CRITICAL_FIELDS.filter((k) => !same(k)).map(
    (k) => `${k}: expected ${String(t[k])}, read ${String(g[k])}`,
  );
}
