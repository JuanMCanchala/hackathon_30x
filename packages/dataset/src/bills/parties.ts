/**
 * Bill factories per issuer. Each returns the ground-truth extraction for one month, so the
 * scripted months, attacks and live files share exactly the same issuer details.
 */
import { bill } from '../bill';

const MONTH_ES: Record<string, string> = {
  '08': 'agosto',
  '09': 'septiembre',
  '10': 'octubre',
};
const MONTH_PT: Record<string, string> = { '08': 'agosto', '09': 'setembro', '10': 'outubro' };
const MONTH_EN: Record<string, string> = { '08': 'August', '09': 'September', '10': 'October' };

const es = (period: string) => `${MONTH_ES[period.slice(5)]} de ${period.slice(0, 4)}`;
const pt = (period: string) => `${MONTH_PT[period.slice(5)]} de ${period.slice(0, 4)}`;
const en = (period: string) => `${MONTH_EN[period.slice(5)]} ${period.slice(0, 4)}`;

interface Common {
  number: string;
  issueDate: string;
  dueDate?: string | null;
  servicePeriod: string;
}

export const valentina = (
  o: Common & { destination?: string; total?: string; words?: { text: string; value: string } },
) =>
  bill({
    type: 'cuenta_de_cobro',
    language: 'es',
    issuer: {
      name: 'Valentina Ríos Mejía',
      taxId: 'C.C. 1.020.304.050',
      country: 'CO',
      email: 'valentina.rios@example.com',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: [
      {
        description: `Servicios de desarrollo frontend correspondientes a ${es(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: o.total ?? '14000000.00',
        amount: o.total ?? '14000000.00',
      },
    ],
    words: o.words ?? { text: 'Catorce millones de pesos m/cte', value: '14000000' },
    payout: { method: 'bre_b', destination: o.destination ?? '@valrios' },
    category: 'contractor',
  });

export const mateo = (
  o: Common & { items?: { description: string; amount: string }[]; total?: string },
) =>
  bill({
    language: 'es',
    issuer: {
      name: 'Mateo Herrera Garza',
      taxId: 'RFC HEGM900101AB1',
      country: 'MX',
      email: 'mateo.herrera@example.com',
    },
    billTo: { name: 'ANDES LABS INC.', taxId: 'XEXX010101000' },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'MXN',
    items: (
      o.items ?? [
        {
          description: `Servicios de desarrollo backend — ${es(o.servicePeriod)}`,
          amount: '72000.00',
        },
      ]
    ).map((i) => ({ ...i, quantity: '1', unitPrice: i.amount })),
    taxes: [{ name: 'IVA 0% (exportación de servicios)', rate: '0', amount: '0.00' }],
    total: o.total,
    payout: {
      method: 'spei',
      destination: '012180001234567891',
      bankName: 'Banco Ficticio del Norte',
    },
    category: 'contractor',
  });

export const camila = (o: Common & { currency?: string; total?: string }) =>
  bill({
    language: 'pt',
    issuer: {
      name: 'Camila Souza Lima',
      taxId: 'CPF 111.444.777-35',
      country: 'BR',
      email: 'camila.souza@exemplo.com.br',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: o.currency ?? 'BRL',
    items: [
      {
        description: `Design de produto — ${pt(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: o.total ?? '16200.00',
        amount: o.total ?? '16200.00',
      },
    ],
    payout: { method: 'pix', destination: 'camila.souza@exemplo.com.br' },
    category: 'contractor',
  });

export const tomas = (o: Common & { destination?: string; bankName?: string }) =>
  bill({
    language: 'en',
    issuer: {
      name: 'Tomás Aguirre Paz',
      taxId: 'CUIT 20-31234567-8',
      country: 'AR',
      email: 'tomas.aguirre@example.com',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'USD',
    items: [
      {
        description: `Data engineering services — ${en(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: '4200.00',
        amount: '4200.00',
      },
    ],
    payout: {
      method: 'wire',
      destination: o.destination ?? '000123456789',
      bankName: o.bankName ?? 'Banco Ejemplo de Miami',
      accountHolder: 'Tomás Aguirre Paz',
    },
    category: 'contractor',
  });

export const sebastian = (o: Common & { total?: string; words: { text: string; value: string } }) =>
  bill({
    type: 'cuenta_de_cobro',
    language: 'es',
    issuer: {
      name: 'Sebastián Prada Duque',
      taxId: 'C.C. 80.123.456',
      country: 'CO',
      email: 'sebastian.prada@example.com',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: [
      {
        description: `Servicios de QA y automatización de pruebas — ${es(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: o.total ?? '10000000.00',
        amount: o.total ?? '10000000.00',
      },
    ],
    words: o.words,
    payout: { method: 'bre_b', destination: '@sebaspd' },
    category: 'contractor',
  });

export const altamar = (o: Common & { items: { description: string; amount: string }[] }) =>
  bill({
    language: 'en',
    issuer: {
      name: 'Altamar Hosting LLC',
      taxId: 'EIN 85-3344556',
      country: 'US',
      email: 'billing@altamar.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'USD',
    items: o.items.map((i) => ({ ...i, quantity: '1', unitPrice: i.amount })),
    payout: {
      method: 'ach',
      destination: '000456789012',
      bankName: 'Banco Ejemplo',
      accountHolder: 'Altamar Hosting LLC',
    },
    category: 'software',
  });

export const tablero = (o: Common & { seats: number; unit: string; total: string }) =>
  bill({
    language: 'en',
    issuer: {
      name: 'Tablero Software LLC',
      taxId: 'EIN 87-7654321',
      country: 'US',
      email: 'billing@tablero.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'USD',
    items: [
      {
        description: `Tablero Team plan — ${o.seats} seats (${en(o.servicePeriod)})`,
        quantity: String(o.seats),
        unitPrice: o.unit,
        amount: o.total,
      },
    ],
    payout: { method: 'card', destination: '4421', bankName: 'Visa', accountHolder: null },
    category: 'software',
  });

export const senal = (o: Common & { description?: string }) =>
  bill({
    language: 'en',
    issuer: {
      name: 'Señal Analytics Inc.',
      taxId: 'EIN 86-1112223',
      country: 'US',
      email: 'billing@senal.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'USD',
    items: [
      {
        description: o.description ?? `Team plan — ${en(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: '1200.00',
        amount: '1200.00',
      },
    ],
    payout: { method: 'card', destination: '4421', bankName: 'Visa' },
    category: 'software',
  });

export const oficina = (o: Common & { billTo?: { name: string; taxId: string } }) =>
  bill({
    language: 'es',
    issuer: {
      name: 'Oficina Compartida Chapinero S.A.S.',
      taxId: 'NIT 901.234.567-8',
      country: 'CO',
      email: 'facturacion@chapinerocowork.example',
    },
    billTo: o.billTo,
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: [
      {
        description: `Arriendo mensual de 8 puestos de trabajo — ${es(o.servicePeriod)}`,
        quantity: '1',
        unitPrice: '2689075.63',
        amount: '2689075.63',
      },
    ],
    taxes: [{ name: 'IVA 19%', rate: '19', amount: '510924.37' }],
    words: { text: 'Tres millones doscientos mil pesos m/cte', value: '3200000' },
    payout: { method: 'bre_b', destination: '@chapinerocowork' },
    category: 'facilities',
  });

export const codigoNorte = (o: Common & { description: string; amount: string }) =>
  bill({
    language: 'es',
    issuer: {
      name: 'Código Norte S.A. de C.V.',
      taxId: 'RFC CNO150301XY9',
      country: 'MX',
      email: 'facturas@codigonorte.example',
    },
    billTo: { name: 'ANDES LABS INC.', taxId: 'XEXX010101000' },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'MXN',
    items: [{ description: o.description, quantity: '1', unitPrice: o.amount, amount: o.amount }],
    taxes: [{ name: 'IVA 0% (exportación de servicios)', rate: '0', amount: '0.00' }],
    payout: {
      method: 'spei',
      destination: '014180009876543210',
      bankName: 'Banco Ficticio del Norte',
    },
    category: 'services',
  });

export const lexia = (
  o: Common & {
    description: string;
    subtotal: string;
    iva: string;
    words: { text: string; value: string };
  },
) =>
  bill({
    language: 'es',
    issuer: {
      name: 'Lexia Legal S.A.S.',
      taxId: 'NIT 900.777.333-1',
      country: 'CO',
      email: 'facturacion@lexialegal.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: [
      { description: o.description, quantity: '1', unitPrice: o.subtotal, amount: o.subtotal },
    ],
    taxes: [{ name: 'IVA 19%', rate: '19', amount: o.iva }],
    words: o.words,
    payout: { method: 'bre_b', destination: '@lexialegal' },
    category: 'services',
  });

export const pixelaria = (o: Common & { items: { description: string; amount: string }[] }) =>
  bill({
    language: 'pt',
    issuer: {
      name: 'Pixelaria Estúdio Ltda.',
      taxId: 'CNPJ 12.345.678/0001-95',
      country: 'BR',
      email: 'financeiro@pixelaria.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'BRL',
    items: o.items.map((i) => ({ ...i, quantity: '1', unitPrice: i.amount })),
    payout: { method: 'pix', destination: '12.345.678/0001-95' },
    category: 'services',
  });

export const ruta = (
  o: Common & {
    items: { description: string; amount: string }[];
    words: { text: string; value: string };
  },
) =>
  bill({
    language: 'es',
    issuer: {
      name: 'Ruta Viajes S.A.S.',
      taxId: 'NIT 901.888.444-2',
      country: 'CO',
      email: 'facturas@rutaviajes.example',
    },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: o.items.map((i) => ({ ...i, quantity: '1', unitPrice: i.amount })),
    words: o.words,
    payout: { method: 'bre_b', destination: '@rutaviajes' },
    category: 'travel',
  });

export const rafael = (o: Common) =>
  bill({
    type: 'cuenta_de_cobro',
    language: 'es',
    issuer: { name: 'Rafael Mendoza Castro', taxId: 'C.C. 79.555.123', country: 'CO', email: null },
    billTo: { name: null, taxId: null },
    number: o.number,
    issueDate: o.issueDate,
    dueDate: o.dueDate ?? null,
    servicePeriod: o.servicePeriod,
    currency: 'COP',
    items: [],
    total: '9000000.00',
    words: { text: 'nueve millones de pesos', value: '9000000' },
    payout: { method: 'bre_b', destination: '@rafamendoza' },
    category: 'contractor',
    description: `Análisis de datos, ${es(o.servicePeriod)}`,
  });

export { en, es, pt };
