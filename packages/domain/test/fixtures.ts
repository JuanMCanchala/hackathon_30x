import { addDays } from '../src/dates';
import { normalizeInvoiceNumber, normalizeTaxId } from '../src/text';
import { DEFAULT_POLICY } from '../src/types';
import type {
  Contract,
  ContractTerm,
  DecisionContext,
  EvidenceItem,
  ExtractedBill,
  ExtractedLine,
  FxSnapshot,
  HistoryBill,
  LineMatch,
  Policy,
  Vendor,
} from '../src/types';

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

// ---------------------------------------------------------------------------
// Decision-engine fixtures: a small fictitious organization (Altamar Labs Inc.).
// Reused by the engine tests, the property tests and the dataset.
// ---------------------------------------------------------------------------

export const RATE_MINOR = 11_500_000; // COP 115.000/h
export const NOW = '2026-11-02T15:00:00Z';

export const FX: FxSnapshot = {
  asOf: '2026-11-02',
  perUsd: { USD: '1', COP: '4000', MXN: '18.50', BRL: '5.40' },
};

export const ospina: Vendor = {
  id: 'v-ospina',
  name: 'Daniela Ospina',
  legalName: 'Daniela Ospina Restrepo',
  country: 'CO',
  taxId: '1.020.304.050',
  email: 'daniela@ospina.dev',
  contactName: 'Daniela Ospina',
  payout: { rail: 'bre-b', currency: 'COP', destination: '3001234567', display: 'Bre-B ••• 4567' },
};

export const marea: Vendor = {
  id: 'v-marea',
  name: 'Estudio Marea',
  legalName: 'Estudio Marea S.A.S.',
  country: 'CO',
  taxId: '901.555.222-7',
  email: 'cuentas@estudiomarea.co',
  contactName: 'Paula Rentería',
  payout: {
    rail: 'bre-b',
    currency: 'COP',
    destination: 'pagos@estudiomarea.co',
    display: 'Bre-B pagos@…',
  },
};

export const herrera: Vendor = {
  id: 'v-herrera',
  name: 'Joaquín Herrera',
  legalName: 'Joaquín Herrera Villalobos',
  country: 'MX',
  taxId: 'HEVJ900101AB1',
  email: 'joaquin@herrera.mx',
  contactName: 'Joaquín Herrera',
  payout: {
    rail: 'spei',
    currency: 'MXN',
    destination: '012180001234567897',
    display: 'CLABE ••• 7897',
  },
};

export const nimbus: Vendor = {
  id: 'v-nimbus',
  name: 'Nimbus Cloud',
  legalName: 'Nimbus Cloud Inc.',
  country: 'US',
  taxId: '84-1234567',
  email: 'billing@nimbus.example',
  contactName: 'Equipo de facturación',
  payout: {
    rail: 'ach',
    currency: 'USD',
    destination: '021000021-123456789',
    display: 'ACH ••• 6789',
  },
};

const contractBase = {
  validFrom: '2026-01-01',
  validTo: null,
  netDays: 15,
  earlyPayment: null,
  vendorResponseDays: 5,
};

export const hourlyContract: Contract = {
  ...contractBase,
  id: 'c-ospina',
  vendorId: ospina.id,
  type: 'hourly',
  title: 'Desarrollo de pagos — Daniela Ospina',
  currency: 'COP',
  terms: [hourlyTerm],
  periodCapMinor: 2_300_000_000, // COP 23.000.000 per month (200 h)
  allowPartial: true,
  evidenceRuleText: 'Horas registradas en Toggl para el período facturado.',
};

export const brandKitTerm: ContractTerm = {
  id: 'marea-brand-kit',
  kind: 'milestone',
  title: 'Brand kit v2',
  unitPriceMinor: 1_200_000_000, // COP 12.000.000
  evidence: { type: 'deliverable', deliverableId: 'brand-kit-v2' },
};

export const deliverableContract: Contract = {
  ...contractBase,
  id: 'c-marea',
  vendorId: marea.id,
  type: 'milestone',
  title: 'Identidad de marca — Estudio Marea',
  currency: 'COP',
  terms: [brandKitTerm],
  periodCapMinor: 2_000_000_000,
  allowPartial: false,
  evidenceRuleText: 'Entregable aprobado por la PM de Altamar.',
};

export const speiTerm: ContractTerm = {
  id: 'herrera-spei',
  kind: 'milestone',
  title: 'Integración SPEI',
  unitPriceMinor: 4_500_000, // MXN 45.000,00
  evidence: { type: 'github_pr', repo: 'altamar-labs/pagos', number: 42 },
};

export const milestoneContract: Contract = {
  ...contractBase,
  id: 'c-herrera',
  vendorId: herrera.id,
  type: 'milestone',
  title: 'Integración SPEI — Joaquín Herrera',
  currency: 'MXN',
  terms: [speiTerm],
  periodCapMinor: 10_000_000,
  allowPartial: false,
  evidenceRuleText: 'PR fusionado en altamar-labs/pagos.',
};

export const retainerTerm: ContractTerm = {
  id: 'nimbus-mensual',
  kind: 'retainer',
  title: 'Suscripción mensual',
  unitPriceMinor: 120_000, // USD 1.200,00
  evidence: null,
};

export const retainerContract: Contract = {
  ...contractBase,
  id: 'c-nimbus',
  vendorId: nimbus.id,
  type: 'retainer',
  title: 'Nimbus Cloud — plan Team',
  currency: 'USD',
  terms: [retainerTerm],
  periodCapMinor: 150_000,
  allowPartial: false,
  evidenceRuleText: 'El cronograma firmado basta.',
};

export const VENDORS = [ospina, marea, herrera, nimbus];
export const CONTRACTS = [hourlyContract, deliverableContract, milestoneContract, retainerContract];

const OCTOBER = { periodFrom: '2026-10-01', periodTo: '2026-10-31', issueDate: '2026-10-31' };

/** Daniela's October bill for `hours` at the contract rate. */
export function hourlyBill(hours: string, overrides: Partial<ExtractedBill> = {}): ExtractedBill {
  const line = hoursLine(hours);
  return bill({
    vendorName: ospina.name,
    vendorTaxId: '1020304050',
    invoiceNumber: 'DO-2026-10',
    ...OCTOBER,
    currency: 'COP',
    total: line.amount,
    lines: [line],
    ...overrides,
  });
}

/** A one-line milestone bill (no period). */
export function milestoneBill(
  vendor: Vendor,
  term: ContractTerm,
  amount: string,
  currency: string,
  overrides: Partial<ExtractedBill> = {},
): ExtractedBill {
  return bill({
    vendorName: vendor.name,
    vendorTaxId: vendor.taxId,
    invoiceNumber: `${vendor.id.slice(2).toUpperCase()}-001`,
    issueDate: '2026-10-31',
    periodFrom: null,
    periodTo: null,
    currency,
    total: amount,
    lines: [
      { description: term.title, quantity: '1', unit: 'milestone', unitPrice: amount, amount },
    ],
    ...overrides,
  });
}

export function retainerBill(overrides: Partial<ExtractedBill> = {}): ExtractedBill {
  return bill({
    vendorName: nimbus.name,
    vendorTaxId: nimbus.taxId,
    invoiceNumber: 'NIM-2026-10',
    ...OCTOBER,
    currency: 'USD',
    total: '1200.00',
    lines: [
      {
        description: 'Plan Team, octubre',
        quantity: '1',
        unit: 'month',
        unitPrice: '1200.00',
        amount: '1200.00',
      },
    ],
    ...overrides,
  });
}

/** Time entries of at most 8 h each, one per day starting at `from`. */
export function timeEntries(
  hours: number,
  from = '2026-10-01',
  vendorId = ospina.id,
): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (let left = hours * 60, day = 0; left > 0; left -= 480, day++) {
    out.push(
      item({
        id: `te-${from}-${day}`,
        vendorId,
        minutes: Math.min(480, left),
        occurredAt: `${addDays(from, day)}T09:00:00-05:00`,
      }),
    );
  }
  return out;
}

export function mergedPrs(n: number, vendorId = ospina.id): EvidenceItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({
      id: `pr-${i + 1}`,
      vendorId,
      source: 'github',
      origin: 'live',
      kind: 'pr_merged',
      ref: `altamar-labs/pagos#${100 + i}`,
      title: `PR ${100 + i}`,
      url: `https://github.com/altamar-labs/pagos/pull/${100 + i}`,
      occurredAt: `${addDays('2026-10-02', i)}T12:00:00Z`,
    }),
  );
}

/** A previous bill of Daniela's hourly contract for October (override as needed). */
export function history(overrides: Partial<HistoryBill> = {}): HistoryBill {
  return {
    billId: 'b-prev',
    vendorId: ospina.id,
    contractId: hourlyContract.id,
    invoiceNumberNormalized: normalizeInvoiceNumber('DO-2026-10'),
    status: 'PAID',
    paidMinor: 0,
    currency: 'COP',
    periodFrom: '2026-10-01',
    periodTo: '2026-10-31',
    termIds: [hourlyTerm.id],
    chain: [overrides.billId ?? 'b-prev'],
    ...overrides,
  };
}

export interface ContextOptions {
  /** term id per bill line (default: the vendor's first contract term for every line) */
  termIds?: (string | null)[];
  matchConfidence?: number;
  matches?: LineMatch[] | null;
  matchError?: string | null;
  evidence?: EvidenceItem[];
  history?: HistoryBill[];
  documentText?: string | null;
  chain?: string[];
  billId?: string;
  case?: DecisionContext['case'];
  policy?: Partial<Policy>;
  fx?: FxSnapshot;
  vendors?: Vendor[];
  contracts?: Contract[];
  now?: string;
  readingError?: string | null;
}

/** A DecisionContext around `reading`; lines map to terms with high confidence by default. */
export function context(reading: ExtractedBill | null, o: ContextOptions = {}): DecisionContext {
  const billId = o.billId ?? 'b-new';
  const contracts = o.contracts ?? CONTRACTS;
  const taxId = normalizeTaxId(reading?.vendorTaxId ?? '');
  const vendor = VENDORS.find((v) => taxId !== '' && normalizeTaxId(v.taxId) === taxId);
  const firstTerm = contracts.find((c) => c.vendorId === vendor?.id)?.terms[0]?.id ?? null;
  const matches =
    o.matches !== undefined
      ? o.matches
      : (reading?.lines.map((_, i) => ({
          lineIndex: i,
          termId: o.termIds ? (o.termIds[i] ?? null) : firstTerm,
          confidence: o.matchConfidence ?? 0.95,
          reason: 'fixture',
        })) ?? null);
  return {
    now: o.now ?? NOW,
    policy: { ...DEFAULT_POLICY, ...o.policy },
    fx: o.fx ?? FX,
    bill: {
      id: billId,
      reading,
      readingError: o.readingError ?? null,
      documentText: o.documentText ?? null,
      receivedAt: '2026-10-31T18:00:00Z',
      channel: 'email',
      chain: o.chain ?? [billId],
    },
    vendors: o.vendors ?? VENDORS,
    contracts,
    matches,
    matchError: o.matchError ?? null,
    evidence: o.evidence ?? [],
    history: o.history ?? [],
    case: o.case ?? { paidMinor: 0, askedAt: null },
  };
}
