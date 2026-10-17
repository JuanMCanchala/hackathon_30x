/**
 * Andes Labs Inc. — a fictitious Delaware company with a distributed team in Latin America.
 * Every person, company, tax ID, phone, key and account number here is invented.
 */
import type {
  AgentScope,
  Mandate,
  MandateTerms,
  OrganizationProfile,
  Payee,
  PolicyTerms,
  UserSnapshot,
} from '@mandato/domain';

export const ORGANIZATION: OrganizationProfile = {
  id: 'org_andes',
  name: 'Andes Labs',
  legalName: 'Andes Labs Inc.',
  taxId: '88-1234567',
  aliases: ['Andes Labs Inc', 'Andes Labs, Inc.', 'ANDES LABS INC.'],
  timeZone: 'America/Bogota',
};

export const ORGANIZATION_ADDRESS = '100 Ejemplo Ave, Suite 400, Miami, FL 33100, EE. UU.';
export const AP_EMAIL = 'pagos@andeslabs.example';

/** Simulated treasury balance in the company's USD account. */
export const TREASURY_BALANCE_USD_CENTS = 25_000_000;

export const USERS: UserSnapshot[] = [
  {
    id: 'usr_laura',
    name: 'Laura Méndez',
    email: 'laura@andeslabs.example',
    role: 'operator',
    canApprove: false,
    canSign: false,
  },
  {
    id: 'usr_martin',
    name: 'Martín Ocampo',
    email: 'martin@andeslabs.example',
    role: 'approver',
    canApprove: true,
    canSign: true,
  },
  {
    id: 'usr_sofia',
    name: 'Sofía Herrera',
    email: 'sofia@andeslabs.example',
    role: 'controller',
    canApprove: true,
    canSign: true,
  },
];

export const USER_TITLES: Record<string, string> = {
  usr_laura: 'Operaciones de finanzas',
  usr_martin: 'CFO',
  usr_sofia: 'Contralora',
};

export const INITIAL_POLICY: PolicyTerms = {
  allowedCurrencies: ['USD', 'COP', 'MXN', 'BRL'],
  autonomousLimitUsdCents: 500_000,
  dualApprovalAboveUsdCents: 1_500_000,
  monthlyBudgetUsdCents: 4_000_000,
  minExtractionConfidence: 0.85,
  duplicateWindowDays: 20,
  maxInvoiceAgeDays: 120,
  defaultPaymentTermsDays: 15,
  fx: {
    asOf: '2026-09-01',
    source: 'Tasas de referencia simuladas para la demo (no son tasas de mercado)',
    unitsPerUsd: { USD: '1', COP: '4000', MXN: '18.50', BRL: '5.40' },
  },
};

export const PAYEES: Payee[] = [
  {
    id: 'pay_valentina',
    name: 'Valentina Ríos Mejía',
    legalName: 'Valentina Ríos Mejía',
    country: 'CO',
    taxId: 'CC 1.020.304.050',
    category: 'contractor',
    currency: 'COP',
    destination: { method: 'bre_b', value: '@valrios', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_mateo',
    name: 'Mateo Herrera Garza',
    legalName: 'Mateo Herrera Garza',
    country: 'MX',
    taxId: 'HEGM900101AB1',
    category: 'contractor',
    currency: 'MXN',
    destination: {
      method: 'spei',
      value: '012180001234567891',
      bankName: 'Banco Ficticio del Norte',
    },
    status: 'active',
  },
  {
    id: 'pay_camila',
    name: 'Camila Souza Lima',
    legalName: 'Camila Souza Lima',
    country: 'BR',
    taxId: 'CPF 111.444.777-35',
    category: 'contractor',
    currency: 'BRL',
    destination: { method: 'pix', value: 'camila.souza@exemplo.com.br', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_tomas',
    name: 'Tomás Aguirre Paz',
    legalName: 'Tomás Aguirre Paz',
    country: 'AR',
    taxId: 'CUIT 20-31234567-8',
    category: 'contractor',
    currency: 'USD',
    destination: { method: 'wire', value: '000123456789', bankName: 'Banco Ejemplo de Miami' },
    status: 'active',
  },
  {
    id: 'pay_sebastian',
    name: 'Sebastián Prada Duque',
    legalName: 'Sebastián Prada Duque',
    country: 'CO',
    taxId: 'CC 80.123.456',
    category: 'contractor',
    currency: 'COP',
    destination: { method: 'bre_b', value: '@sebaspd', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_altamar',
    name: 'Altamar Hosting',
    legalName: 'Altamar Hosting LLC',
    country: 'US',
    taxId: '85-3344556',
    category: 'software',
    currency: 'USD',
    destination: { method: 'ach', value: '000456789012', bankName: 'Banco Ejemplo' },
    status: 'active',
  },
  {
    id: 'pay_tablero',
    name: 'Tablero.io',
    legalName: 'Tablero Software LLC',
    country: 'US',
    taxId: '87-7654321',
    category: 'software',
    currency: 'USD',
    destination: { method: 'card', value: '4421', bankName: 'Tarjeta corporativa' },
    status: 'active',
  },
  {
    id: 'pay_senal',
    name: 'Señal Analytics',
    legalName: 'Señal Analytics Inc.',
    country: 'US',
    taxId: '86-1112223',
    category: 'software',
    currency: 'USD',
    destination: { method: 'card', value: '4421', bankName: 'Tarjeta corporativa' },
    status: 'active',
  },
  {
    id: 'pay_oficina',
    name: 'Oficina Compartida Chapinero',
    legalName: 'Oficina Compartida Chapinero S.A.S.',
    country: 'CO',
    taxId: 'NIT 901.234.567-8',
    category: 'facilities',
    currency: 'COP',
    destination: { method: 'bre_b', value: '@chapinerocowork', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_codigo_norte',
    name: 'Código Norte',
    legalName: 'Código Norte S.A. de C.V.',
    country: 'MX',
    taxId: 'CNO150301XY9',
    category: 'services',
    currency: 'MXN',
    destination: {
      method: 'spei',
      value: '014180009876543210',
      bankName: 'Banco Ficticio del Norte',
    },
    status: 'active',
  },
  {
    id: 'pay_lexia',
    name: 'Lexia Legal',
    legalName: 'Lexia Legal S.A.S.',
    country: 'CO',
    taxId: 'NIT 900.777.333-1',
    category: 'services',
    currency: 'COP',
    destination: { method: 'bre_b', value: '@lexialegal', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_pixelaria',
    name: 'Pixelaria Estúdio',
    legalName: 'Pixelaria Estúdio Ltda.',
    country: 'BR',
    taxId: 'CNPJ 12.345.678/0001-95',
    category: 'services',
    currency: 'BRL',
    destination: { method: 'pix', value: '12345678000195', bankName: null },
    status: 'active',
  },
  {
    id: 'pay_ruta',
    name: 'Ruta Viajes',
    legalName: 'Ruta Viajes S.A.S.',
    country: 'CO',
    taxId: 'NIT 901.888.444-2',
    category: 'travel',
    currency: 'COP',
    destination: { method: 'bre_b', value: '@rutaviajes', bankName: null },
    status: 'active',
  },
];

export function payee(id: string): Payee {
  const found = PAYEES.find((p) => p.id === id);
  if (!found) throw new Error(`unknown payee ${id}`);
  return found;
}

const SIGNED_AT = '2026-01-05T15:00:00.000Z';

function mandate(
  payeeId: string,
  terms: Pick<MandateTerms, 'amount' | 'periodCapMinor'> & Partial<MandateTerms>,
): Mandate {
  const p = payee(payeeId);
  const key = payeeId.replace('pay_', 'man_');
  return {
    id: `${key}_v1`,
    key,
    version: 1,
    payeeId,
    status: 'active',
    terms: {
      currency: p.currency,
      maxInvoicesPerPeriod: 1,
      autonomousLimitOverrideUsdCents: null,
      validFrom: '2026-01-01',
      validUntil: '2026-12-31',
      note: null,
      ...terms,
    },
    signedBy: [{ userId: 'usr_martin', name: 'Martín Ocampo', at: SIGNED_AT }],
    source: 'seed',
    signedAt: SIGNED_AT,
  };
}

/** Mandates signed before the demo starts. Lexia Legal and Pixelaria have none. */
export const MANDATES: Mandate[] = [
  mandate('pay_valentina', {
    amount: { kind: 'fixed', amountMinor: 1_400_000_000, tolerancePct: 0 },
    periodCapMinor: 1_400_000_000,
    note: 'Desarrollo frontend, tarifa mensual fija.',
  }),
  mandate('pay_mateo', {
    amount: { kind: 'fixed', amountMinor: 7_200_000, tolerancePct: 0 },
    periodCapMinor: 7_200_000,
    note: 'Desarrollo backend, tarifa mensual fija.',
  }),
  mandate('pay_camila', {
    amount: { kind: 'fixed', amountMinor: 1_620_000, tolerancePct: 0 },
    periodCapMinor: 1_620_000,
    note: 'Diseño de producto, tarifa mensual fija.',
  }),
  mandate('pay_tomas', {
    amount: { kind: 'fixed', amountMinor: 420_000, tolerancePct: 0 },
    periodCapMinor: 420_000,
    note: 'Ingeniería de datos, tarifa mensual fija en USD.',
  }),
  mandate('pay_sebastian', {
    amount: { kind: 'fixed', amountMinor: 1_000_000_000, tolerancePct: 0 },
    periodCapMinor: 1_000_000_000,
    note: 'QA y automatización, tarifa mensual fija.',
  }),
  mandate('pay_altamar', {
    amount: { kind: 'up_to', maxMinor: 250_000 },
    periodCapMinor: 250_000,
    note: 'Hosting por consumo: hasta USD 2.500 al mes.',
  }),
  mandate('pay_tablero', {
    amount: { kind: 'fixed', amountMinor: 48_000, tolerancePct: 10 },
    periodCapMinor: 52_800,
    note: 'Suscripción por puestos (40 × USD 12).',
  }),
  mandate('pay_senal', {
    amount: { kind: 'fixed', amountMinor: 120_000, tolerancePct: 10 },
    periodCapMinor: 132_000,
    note: 'Suscripción de analítica, plan Team.',
  }),
  mandate('pay_oficina', {
    amount: { kind: 'fixed', amountMinor: 320_000_000, tolerancePct: 0 },
    periodCapMinor: 320_000_000,
    note: 'Arriendo de 8 puestos en el coworking.',
  }),
  mandate('pay_codigo_norte', {
    amount: { kind: 'up_to', maxMinor: 14_800_000 },
    periodCapMinor: 14_800_000,
    note: 'Agencia de desarrollo: retainer mensual hasta MXN 148.000.',
  }),
  mandate('pay_ruta', {
    amount: { kind: 'up_to', maxMinor: 1_800_000_000 },
    periodCapMinor: 1_800_000_000,
    note: 'Viajes del equipo: hasta COP 18.000.000 al mes.',
  }),
];

export interface AgentSeed {
  id: string;
  name: string;
  description: string;
  scope: AgentScope;
  /** Demo-only key; production keys are generated and shown once. */
  demoKey: string;
}

export const AGENTS: AgentSeed[] = [
  {
    id: 'agt_compras',
    name: 'Agente de compras',
    description:
      'Agente de IA del equipo de operaciones que renueva suscripciones de software. Se conecta por MCP.',
    scope: { categories: ['software'], maxPerRequestUsdCents: 100_000 },
    demoKey: 'mnd_demo_agente_compras_2026',
  },
];
