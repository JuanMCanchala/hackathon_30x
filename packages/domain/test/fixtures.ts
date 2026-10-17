import type {
  DecisionContext,
  ExtractedInvoice,
  HistoryInvoice,
  Mandate,
  OrganizationProfile,
  Payee,
  PolicyTerms,
  Requester,
} from '../src';

export const ORG: OrganizationProfile = {
  id: 'org_andes',
  name: 'Andes Labs',
  legalName: 'Andes Labs Inc.',
  taxId: '88-1234567',
  aliases: ['Andes Labs Inc', 'Andes Labs, Inc.'],
  timeZone: 'America/Bogota',
};

export const POLICY: PolicyTerms = {
  allowedCurrencies: ['USD', 'COP', 'MXN', 'BRL'],
  autonomousLimitUsdCents: 500_000,
  dualApprovalAboveUsdCents: 1_500_000,
  monthlyBudgetUsdCents: 3_000_000,
  minExtractionConfidence: 0.85,
  duplicateWindowDays: 20,
  maxInvoiceAgeDays: 120,
  defaultPaymentTermsDays: 15,
  fx: {
    asOf: '2026-09-01',
    source: 'Tasas de referencia simuladas',
    unitsPerUsd: { USD: '1', COP: '4000', MXN: '18.50', BRL: '5.40' },
  },
};

export const VALENTINA: Payee = {
  id: 'pay_valentina',
  name: 'Valentina Ríos Mejía',
  legalName: 'Valentina Ríos Mejía',
  country: 'CO',
  taxId: 'CC 1.020.304.050',
  category: 'contractor',
  currency: 'COP',
  destination: { method: 'bre_b', value: '@valrios', bankName: null },
  status: 'active',
};

export const MATEO: Payee = {
  id: 'pay_mateo',
  name: 'Mateo Herrera Garza',
  legalName: 'Mateo Herrera Garza',
  country: 'MX',
  taxId: 'HEGM900101AB1',
  category: 'contractor',
  currency: 'MXN',
  destination: { method: 'spei', value: '012180001234567891', bankName: 'Banco Ficticio' },
  status: 'active',
};

export const CODIGO_NORTE: Payee = {
  id: 'pay_codigo_norte',
  name: 'Código Norte',
  legalName: 'Código Norte S.A. de C.V.',
  country: 'MX',
  taxId: 'CNO150301XY9',
  category: 'services',
  currency: 'MXN',
  destination: { method: 'spei', value: '014180009876543210', bankName: 'Banco Ficticio' },
  status: 'active',
};

export const TABLERO: Payee = {
  id: 'pay_tablero',
  name: 'Tablero.io',
  legalName: 'Tablero Software LLC',
  country: 'US',
  taxId: '87-7654321',
  category: 'software',
  currency: 'USD',
  destination: { method: 'card', value: 'tarjeta corporativa 4421', bankName: null },
  status: 'active',
};

export const PAYEES = [VALENTINA, MATEO, CODIGO_NORTE, TABLERO];

function mandate(
  id: string,
  payee: Payee,
  terms: Partial<Mandate['terms']> & Pick<Mandate['terms'], 'amount' | 'periodCapMinor'>,
): Mandate {
  return {
    id,
    key: `${id}_key`,
    version: 1,
    payeeId: payee.id,
    status: 'active',
    terms: {
      currency: payee.currency,
      maxInvoicesPerPeriod: 1,
      autonomousLimitOverrideUsdCents: null,
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      note: null,
      ...terms,
    },
    signedBy: [{ userId: 'usr_martin', name: 'Martín Ocampo', at: '2026-01-01T12:00:00Z' }],
    source: 'seed',
    signedAt: '2026-01-01T12:00:00Z',
  };
}

export const MANDATE_VALENTINA = mandate('man_valentina', VALENTINA, {
  amount: { kind: 'fixed', amountMinor: 1_400_000_000, tolerancePct: 0 },
  periodCapMinor: 1_400_000_000,
});
export const MANDATE_MATEO = mandate('man_mateo', MATEO, {
  amount: { kind: 'fixed', amountMinor: 7_200_000, tolerancePct: 0 },
  periodCapMinor: 7_200_000,
});
export const MANDATE_TABLERO = mandate('man_tablero', TABLERO, {
  amount: { kind: 'fixed', amountMinor: 48_000, tolerancePct: 10 },
  periodCapMinor: 52_800,
});
export const MANDATE_CODIGO_NORTE = mandate('man_codigo_norte', CODIGO_NORTE, {
  amount: { kind: 'up_to', maxMinor: 18_500_000 },
  periodCapMinor: 18_500_000,
});

export const MANDATES = [MANDATE_VALENTINA, MANDATE_MATEO, MANDATE_TABLERO, MANDATE_CODIGO_NORTE];

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    const current = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && current && typeof current === 'object'
        ? merge(current, v as DeepPartial<typeof current>)
        : v;
  }
  return out as T;
}

/** Valentina's September cuenta de cobro, read perfectly. */
export function extraction(patch?: DeepPartial<ExtractedInvoice>): ExtractedInvoice {
  const base: ExtractedInvoice = {
    documentType: 'cuenta_de_cobro',
    language: 'es',
    issuer: {
      name: 'Valentina Ríos Mejía',
      taxId: 'CC 1020304050',
      country: 'CO',
      email: 'valentina@example.com',
    },
    billTo: { name: 'Andes Labs Inc.', taxId: '88-1234567' },
    invoiceNumber: 'CC-2026-09',
    issueDate: '2026-09-01',
    dueDate: '2026-09-10',
    servicePeriod: '2026-09',
    currency: 'COP',
    total: '14000000.00',
    subtotal: '14000000.00',
    amountInWords: 'Catorce millones de pesos',
    amountInWordsValue: '14000000',
    lineItems: [
      {
        description: 'Desarrollo frontend, septiembre',
        quantity: '1',
        unitPrice: '14000000',
        amount: '14000000',
      },
    ],
    taxes: [],
    payout: { method: 'bre_b', destination: '@valrios', bankName: null, accountHolder: null },
    category: 'contractor',
    description: 'Servicios de desarrollo frontend',
    agentInstructions: { detected: false, quote: null },
    confidence: {
      issuer: 0.98,
      invoiceNumber: 0.97,
      issueDate: 0.96,
      dueDate: 0.95,
      currency: 0.99,
      total: 0.99,
      payout: 0.97,
    },
    warnings: [],
  };
  return merge(base, patch);
}

export function context(options: {
  extraction?: ExtractedInvoice | null;
  extractionError?: string | null;
  history?: HistoryInvoice[];
  now?: string;
  policy?: Partial<PolicyTerms>;
  payees?: Payee[];
  mandates?: Mandate[];
  availableUsdCents?: number;
  requester?: Requester;
  scanPhrases?: string[];
}): DecisionContext {
  return {
    now: options.now ?? '2026-09-03T15:00:00Z',
    organization: ORG,
    invoice: {
      extraction: options.extraction === undefined ? extraction() : options.extraction,
      extractionError: options.extractionError ?? null,
      source: 'dataset',
      instructionScan: {
        matched: (options.scanPhrases ?? []).length > 0,
        phrases: options.scanPhrases ?? [],
      },
    },
    policy: { version: 1, terms: { ...POLICY, ...options.policy } },
    payees: options.payees ?? PAYEES,
    mandates: options.mandates ?? MANDATES,
    history: options.history ?? [],
    treasury: { availableUsdCents: options.availableUsdCents ?? 25_000_000 },
    requester: options.requester ?? { kind: 'user', userId: 'usr_laura', name: 'Laura Méndez' },
  };
}

export function history(
  patch: Partial<HistoryInvoice> & Pick<HistoryInvoice, 'ref'>,
): HistoryInvoice {
  return {
    invoiceId: `inv_${patch.ref}`,
    payeeId: VALENTINA.id,
    issuerTaxIdNorm: 'CC1020304050',
    issuerNameFolded: 'valentina rios mejia',
    destinationNorm: '@valrios',
    invoiceNumber: 'CC-2026-08',
    invoiceNumberNorm: 'CC20268',
    amountMinor: 1_400_000_000,
    currency: 'COP',
    usdCents: 350_000,
    issueDate: '2026-08-01',
    servicePeriod: '2026-08',
    periodKey: '2026-09',
    status: 'PAID',
    decidedAt: '2026-09-02T15:00:00Z',
    ...patch,
  };
}
