import type { ContractTerm, EvidenceItem, ExtractedBill, ExtractedLine } from '../src/types';

export const hourlyTerm: ContractTerm = {
  id: 'ospina-horas',
  kind: 'hours',
  title: 'Horas de desarrollo',
  unitPriceMinor: 11_500_000, // COP 115.000/h
  evidence: { type: 'time_entries', project: 'altamar-pagos' },
};

export function bill(overrides: Partial<ExtractedBill> = {}): ExtractedBill {
  return {
    vendorName: 'Ospina',
    vendorTaxId: null,
    invoiceNumber: 'DO-2026-010',
    issueDate: '2026-10-01',
    dueDate: null,
    periodFrom: '2026-09-01',
    periodTo: '2026-09-30',
    currency: 'COP',
    total: null,
    lines: [],
    payoutDetails: null,
    revisionOf: null,
    instructionsToAgent: false,
    confidence: { vendor: 1, invoiceNumber: 1, total: 1, lines: 1, currency: 1, dates: 1 },
    ...overrides,
  };
}

export function hoursLine(quantity: string, rate = '115000.00'): ExtractedLine {
  const amount = (Number(quantity) * Number(rate)).toFixed(2);
  return { description: 'Horas', quantity, unit: 'hour', unitPrice: rate, amount };
}

export function item(overrides: Partial<EvidenceItem>): EvidenceItem {
  return {
    id: 'e1',
    vendorId: 'v1',
    source: 'toggl',
    origin: 'fixture',
    kind: 'time_entry',
    ref: 'altamar-pagos',
    title: 'entry',
    url: null,
    occurredAt: '2026-09-10T09:00:00-05:00',
    ...overrides,
  };
}
