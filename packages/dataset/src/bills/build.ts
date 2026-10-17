import {
  activeContract,
  addDays,
  minorToDecimal,
  parseDecimalToMinor,
  type Currency,
  type ExtractedBill,
  type ExtractedLine,
} from '@recibido/domain';
import { CONTRACTS } from '../contracts';
import { VENDORS } from '../vendors';
import type { BillSpec, Channel, Month } from './types';

export interface LineInput {
  description: string;
  /** null = the line does not correspond to any contract term (by design) */
  termId: string | null;
  unit: ExtractedLine['unit'];
  quantity?: string;
  unitPrice?: string;
  /** defaults to quantity × unitPrice, which must be exact */
  amount?: string;
}

export interface BillInput {
  id: string;
  slug: string;
  channel: Channel;
  vendorId: string | null;
  /** issuer as printed, for an entity that is not a registered vendor */
  issuer?: { name: string; taxId: string };
  invoiceNumber: string | null;
  issueDate: string;
  /** defaults to issueDate + the contract's netDays */
  dueDate?: string | null;
  period?: [string, string];
  currency: Currency;
  lines: LineInput[];
  /** defaults to Σ lines (set it only for the "no cuadra" bills) */
  total?: string;
  payoutDetails?: string | null;
  revisionOf?: string | null;
  instructionsToAgent?: boolean;
  confidence?: Partial<ExtractedBill['confidence']>;
  body?: string;
  revisionOfBillId?: string;
  expected: BillSpec['expected'];
  story: string;
}

const EXT: Record<Channel, string> = { pdf: 'pdf', portal: 'pdf', email: 'eml', chat: 'txt' };

function lineAmount(line: LineInput, currency: Currency): string {
  if (line.amount) return line.amount;
  const unit = parseDecimalToMinor(line.unitPrice, currency);
  const q = /^(\d+)(?:\.(\d{1,2}))?$/.exec(line.quantity ?? '');
  if (unit === null || !q) throw new Error(`line "${line.description}" needs quantity and price`);
  const hundredths = BigInt(q[1]! + (q[2] ?? '').padEnd(2, '0'));
  const product = hundredths * BigInt(unit);
  if (product % 100n !== 0n) throw new Error(`line "${line.description}" is not exact`);
  return minorToDecimal(Number(product / 100n), currency);
}

/** A labeled bill: the ground-truth reading and line matching of a document. */
export function bill(month: Month, input: BillInput): BillSpec {
  const vendor = VENDORS.find((v) => v.id === input.vendorId) ?? null;
  if (input.vendorId && !vendor) throw new Error(`${input.id}: unknown vendor ${input.vendorId}`);
  const contract = vendor ? activeContract(vendor, CONTRACTS, input.issueDate) : null;
  if (vendor && !contract) throw new Error(`${input.id}: no active contract on ${input.issueDate}`);

  const lines: ExtractedLine[] = input.lines.map((l) => ({
    description: l.description,
    quantity: l.quantity ?? null,
    unit: l.unit,
    unitPrice: l.unitPrice ?? null,
    amount: lineAmount(l, input.currency),
  }));
  const sum = lines.reduce((s, l) => s + parseDecimalToMinor(l.amount, input.currency)!, 0);

  const truth: ExtractedBill = {
    vendorName: input.issuer?.name ?? vendor?.legalName ?? null,
    vendorTaxId: input.issuer?.taxId ?? vendor?.taxId ?? null,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    dueDate:
      input.dueDate !== undefined
        ? input.dueDate
        : contract
          ? addDays(input.issueDate, contract.netDays)
          : null,
    periodFrom: input.period?.[0] ?? null,
    periodTo: input.period?.[1] ?? null,
    currency: input.currency,
    total: input.total ?? minorToDecimal(sum, input.currency),
    lines,
    payoutDetails: input.payoutDetails ?? null,
    revisionOf: input.revisionOf ?? null,
    instructionsToAgent: input.instructionsToAgent ?? false,
    confidence: {
      vendor: 1,
      invoiceNumber: 1,
      total: 1,
      lines: 1,
      currency: 1,
      dates: 1,
      ...input.confidence,
    },
  };

  const truthMatches = input.lines.map((l, lineIndex) => {
    const term = contract?.terms.find((t) => t.id === l.termId);
    if (l.termId && !term) throw new Error(`${input.id}: term ${l.termId} not in the contract`);
    return {
      lineIndex,
      termId: term?.id ?? null,
      confidence: 1,
      reason: term
        ? `La línea describe «${term.title}» del contrato.`
        : contract
          ? 'Ningún concepto del contrato corresponde a esta línea.'
          : 'No hay un contrato con este emisor.',
    };
  });

  return {
    id: input.id,
    month,
    file: `${month}/${input.id}-${input.slug}.${EXT[input.channel]}`,
    channel: input.channel,
    vendorId: input.vendorId,
    truth,
    truthMatches,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.revisionOfBillId ? { revisionOfBillId: input.revisionOfBillId } : {}),
    expected: input.expected,
    story: input.story,
  };
}

export const PAID_BY_AGENT: BillSpec['expected'] = {
  first: 'PAY',
  final: 'PAID',
  resolvedBy: 'agent',
};
