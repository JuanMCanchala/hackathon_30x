import type { Contract, ContractTerm } from '@recibido/domain';

/** COP/MXN/BRL/USD amounts in minor units (cents); COP 130.000 → 13_000_000. */
const COP = (pesos: number) => pesos * 100;
const MXN = COP;
const BRL = COP;
const USD = COP;

const hours = (id: string, title: string, rateMinor: number, project: string): ContractTerm => ({
  id,
  kind: 'hours',
  title,
  unitPriceMinor: rateMinor,
  evidence: { type: 'time_entries', project },
});

const deliverable = (
  id: string,
  title: string,
  amountMinor: number,
  deliverableId: string,
): ContractTerm => ({
  id,
  kind: 'milestone',
  title,
  unitPriceMinor: amountMinor,
  evidence: { type: 'deliverable', deliverableId },
});

const order = (id: string, title: string, unitMinor: number, orderId: string): ContractTerm => ({
  id,
  kind: 'goods',
  title,
  unitPriceMinor: unitMinor,
  evidence: { type: 'delivery', orderId },
});

/**
 * One contract per vendor and day (the engine escalates when two are active on the bill's date).
 * Trazo Cloud changed plan on 1 September, so it has two contracts that do not overlap.
 */
export const CONTRACTS: Contract[] = [
  {
    id: 'ct-daniela-ospina',
    vendorId: 'daniela-ospina',
    type: 'hourly',
    title: 'Desarrollo backend de la API de pagos — Daniela Ospina',
    currency: 'COP',
    validFrom: '2026-01-15',
    validTo: '2026-12-31',
    terms: [hours('ospina-horas', 'Desarrollo backend (hora)', COP(130_000), 'api-pagos')],
    periodCapMinor: COP(23_400_000), // 180 h
    netDays: 15,
    earlyPayment: null,
    allowPartial: true,
    vendorResponseDays: 7,
    evidenceRuleText:
      'Horas registradas en Toggl en el proyecto api-pagos durante el período facturado. Si solo una parte tiene registro, se paga esa parte y se pide el resto.',
  },
  {
    id: 'ct-julian-restrepo',
    vendorId: 'julian-restrepo',
    type: 'hourly',
    title: 'Desarrollo frontend de la app web — Julián Restrepo',
    currency: 'COP',
    validFrom: '2026-03-01',
    validTo: null,
    terms: [hours('restrepo-horas', 'Desarrollo frontend (hora)', COP(110_000), 'app-web')],
    periodCapMinor: COP(17_600_000), // 160 h
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 7,
    evidenceRuleText:
      'Horas registradas en Toggl en el proyecto app-web durante el período facturado; los PR fusionados en altamar-labs/app-web las respaldan.',
  },
  {
    id: 'ct-estudio-ceiba',
    vendorId: 'estudio-ceiba',
    type: 'milestone',
    title: 'Identidad visual y piezas de marca — Estudio Ceiba',
    currency: 'COP',
    validFrom: '2026-06-01',
    validTo: '2027-05-31',
    terms: [
      deliverable('ceiba-iconos', 'Sistema de íconos de la app', COP(8_500_000), 'iconos-app'),
      deliverable(
        'ceiba-piezas-sep',
        'Piezas para redes, campaña de septiembre',
        COP(6_200_000),
        'piezas-redes-sep',
      ),
      deliverable('ceiba-brand-kit-v2', 'Brand kit v2', COP(12_000_000), 'brand-kit-v2'),
      deliverable('ceiba-landing', 'Diseño de la landing', COP(6_500_000), 'landing-home'),
    ],
    periodCapMinor: COP(20_000_000),
    netDays: 30,
    earlyPayment: { discountBps: 200, withinDays: 10 },
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText: 'Cada hito se paga cuando Lina Cárdenas (PM) acepta el entregable.',
  },
  {
    id: 'ct-mantenimientos-guadua',
    vendorId: 'mantenimientos-guadua',
    type: 'goods',
    title: 'Dotación y mantenimiento de la oficina de Medellín — Mantenimientos Guadua',
    currency: 'COP',
    validFrom: '2026-07-01',
    validTo: null,
    terms: [
      order('guadua-oc-0912', 'Sillas ergonómicas (OC-0912)', COP(780_000), 'OC-0912'),
      order('guadua-oc-0918', 'Purificadores de aire (OC-0918)', COP(690_000), 'OC-0918'),
      order('guadua-oc-0927', 'Cafetera industrial (OC-0927)', COP(4_200_000), 'OC-0927'),
      order('guadua-oc-1001', 'Escritorios eléctricos (OC-1001)', COP(1_590_000), 'OC-1001'),
      order('guadua-oc-1010', 'Lámparas de escritorio (OC-1010)', COP(145_000), 'OC-1010'),
      order('guadua-oc-1014', 'Kit de repuestos para sillas (OC-1014)', COP(100_000), 'OC-1014'),
    ],
    periodCapMinor: COP(120_000_000),
    netDays: 30,
    earlyPayment: { discountBps: 150, withinDays: 8 },
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText:
      'Cada orden de compra se paga con la confirmación de entrega firmada en la recepción de la oficina.',
  },
  {
    id: 'ct-cardumen-digital',
    vendorId: 'cardumen-digital',
    type: 'retainer',
    title: 'Gestión de pauta y contenidos — Cardumen Digital',
    currency: 'COP',
    validFrom: '2026-05-01',
    validTo: '2027-04-30',
    terms: [
      {
        id: 'cardumen-mensual',
        kind: 'retainer',
        title: 'Gestión de pauta y contenidos (mes)',
        unitPriceMinor: COP(6_800_000),
        evidence: null,
      },
    ],
    periodCapMinor: COP(6_800_000),
    netDays: 30,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText: 'Tarifa mensual fija: el cronograma firmado basta.',
  },
  {
    id: 'ct-andres-villasenor',
    vendorId: 'andres-villasenor',
    type: 'milestone',
    title: 'App móvil: autenticación, pagos y notificaciones — Andrés Villaseñor',
    currency: 'MXN',
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    terms: [
      {
        id: 'villasenor-m1',
        kind: 'milestone',
        title: 'Hito M1: autenticación',
        unitPriceMinor: MXN(62_000),
        evidence: { type: 'github_pr', repo: 'altamar-labs/app-movil', number: 1 },
      },
      {
        id: 'villasenor-m2',
        kind: 'milestone',
        title: 'Hito M2: pagos dentro de la app',
        unitPriceMinor: MXN(74_000),
        evidence: { type: 'github_pr', repo: 'altamar-labs/app-movil', number: 2 },
      },
      {
        id: 'villasenor-m3',
        kind: 'milestone',
        title: 'Hito M3: notificaciones push',
        unitPriceMinor: MXN(85_000),
        evidence: { type: 'github_pr', repo: 'altamar-labs/app-movil', number: 3 },
      },
    ],
    periodCapMinor: MXN(100_000),
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    // development milestones take time: the agent waits longer before escalating
    vendorResponseDays: 15,
    evidenceRuleText: 'Cada hito se paga cuando su PR se fusiona en altamar-labs/app-movil.',
  },
  {
    id: 'ct-renata-aguilar',
    vendorId: 'renata-aguilar',
    type: 'hourly',
    title: 'QA de la app móvil — Renata Aguilar',
    currency: 'MXN',
    validFrom: '2026-04-01',
    validTo: null,
    terms: [hours('aguilar-horas', 'Pruebas de QA (hora)', MXN(520), 'qa-app-movil')],
    periodCapMinor: MXN(83_200), // 160 h
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 7,
    evidenceRuleText: 'Horas registradas en Toggl en el proyecto qa-app-movil durante el período.',
  },
  {
    id: 'ct-ximena-robles',
    vendorId: 'ximena-robles',
    type: 'milestone',
    title: 'Conciliación y reportes — Ximena Robles',
    currency: 'MXN',
    validFrom: '2026-08-01',
    validTo: '2027-01-31',
    terms: [
      {
        id: 'robles-conciliacion',
        kind: 'milestone',
        title: 'Motor de conciliación bancaria',
        unitPriceMinor: MXN(58_000),
        evidence: { type: 'ticket', key: 'ALT-214' },
      },
      {
        id: 'robles-webhooks',
        kind: 'milestone',
        title: 'Webhooks de bancos',
        unitPriceMinor: MXN(34_000),
        evidence: { type: 'ticket', key: 'ALT-221' },
      },
      {
        id: 'robles-reportes',
        kind: 'milestone',
        title: 'Reportes fiscales',
        unitPriceMinor: MXN(46_000),
        evidence: { type: 'ticket', key: 'ALT-238' },
      },
    ],
    periodCapMinor: MXN(100_000),
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 10,
    evidenceRuleText: 'Cada hito se paga cuando su ticket de Linear queda cerrado.',
  },
  {
    id: 'ct-palabra-viva',
    vendorId: 'palabra-viva',
    type: 'usage',
    title: 'Traducción de la app y el centro de ayuda — Palabra Viva',
    currency: 'MXN',
    validFrom: '2026-06-01',
    validTo: null,
    terms: [
      {
        id: 'palabra-viva-palabras',
        kind: 'usage',
        title: 'Traducción ES → PT/EN (palabra)',
        unitPriceMinor: 110, // MXN 1,10
        evidence: { type: 'usage_report', meter: 'palabras-traducidas' },
      },
    ],
    periodCapMinor: MXN(80_000),
    netDays: 30,
    earlyPayment: null,
    allowPartial: true,
    vendorResponseDays: 7,
    evidenceRuleText:
      'Palabras entregadas según el reporte de la plataforma de traducción para el período. Si el reporte cubre solo una parte, se paga esa parte.',
  },
  {
    id: 'ct-thiago-moreira',
    vendorId: 'thiago-moreira',
    type: 'hourly',
    title: 'Ingeniería de datos — Thiago Moreira',
    currency: 'BRL',
    validFrom: '2026-02-01',
    validTo: null,
    terms: [hours('moreira-horas', 'Engenharia de dados (hora)', BRL(180), 'data-warehouse')],
    periodCapMinor: BRL(30_600), // 170 h
    netDays: 15,
    earlyPayment: null,
    allowPartial: true,
    vendorResponseDays: 7,
    evidenceRuleText:
      'Horas registradas en Toggl en el proyecto data-warehouse durante el período facturado.',
  },
  {
    id: 'ct-beatriz-lima',
    vendorId: 'beatriz-lima',
    type: 'hourly',
    title: 'Investigación de usuarios — Beatriz Lima',
    currency: 'BRL',
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    terms: [hours('lima-horas', 'Pesquisa com usuários (hora)', BRL(150), 'pesquisa-usuarios')],
    periodCapMinor: BRL(18_000), // 120 h
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 7,
    evidenceRuleText:
      'Horas registradas en Toggl en el proyecto pesquisa-usuarios durante el período facturado.',
  },
  {
    id: 'ct-estudio-jabuti',
    vendorId: 'estudio-jabuti',
    type: 'milestone',
    title: 'Ilustraciones de producto — Estúdio Jabuti',
    currency: 'BRL',
    validFrom: '2026-08-01',
    validTo: null,
    terms: [
      deliverable(
        'jabuti-onboarding',
        'Ilustrações do onboarding (12 peças)',
        BRL(9_600),
        'ilustracoes-onboarding',
      ),
      deliverable(
        'jabuti-blog',
        'Ilustrações para o blog (6 peças)',
        BRL(2_700),
        'ilustracoes-blog',
      ),
      deliverable('jabuti-mascote', 'Mascote e variações', BRL(7_200), 'mascote-v1'),
      deliverable('jabuti-icones', 'Ícones ilustrados (20 peças)', BRL(3_400), 'icones-ilustrados'),
    ],
    periodCapMinor: BRL(15_000),
    netDays: 30,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 7,
    evidenceRuleText: 'Cada entrega se paga cuando Lina Cárdenas (PM) la acepta.',
  },
  {
    id: 'ct-trazo-cloud-inicial',
    vendorId: 'trazo-cloud',
    type: 'retainer',
    title: 'Trazo Cloud — plan Inicial',
    currency: 'USD',
    validFrom: '2026-01-01',
    validTo: '2026-08-31',
    terms: [
      {
        id: 'trazo-plan-inicial',
        kind: 'retainer',
        title: 'Plan Inicial (mes)',
        unitPriceMinor: USD(900),
        evidence: null,
      },
    ],
    periodCapMinor: USD(900),
    netDays: 10,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText: 'Suscripción mensual: el cronograma firmado basta.',
  },
  {
    id: 'ct-trazo-cloud-equipo',
    vendorId: 'trazo-cloud',
    type: 'retainer',
    title: 'Trazo Cloud — plan Equipo',
    currency: 'USD',
    validFrom: '2026-09-01',
    validTo: null,
    terms: [
      {
        id: 'trazo-plan-equipo',
        kind: 'retainer',
        title: 'Plan Equipo, 25 usuarios (mes)',
        unitPriceMinor: USD(1_200),
        evidence: null,
      },
    ],
    periodCapMinor: USD(1_500),
    netDays: 10,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 5,
    evidenceRuleText: 'Suscripción mensual: el cronograma firmado basta.',
  },
  {
    id: 'ct-faro-hosting',
    vendorId: 'faro-hosting',
    type: 'usage',
    title: 'Faro Hosting — infraestructura por consumo',
    currency: 'USD',
    validFrom: '2026-03-01',
    validTo: null,
    terms: [
      {
        id: 'faro-vcpu',
        kind: 'usage',
        title: 'Cómputo (vCPU-hora)',
        unitPriceMinor: 4, // USD 0,04
        evidence: { type: 'usage_report', meter: 'faro-vcpu-horas' },
      },
      {
        id: 'faro-transferencia',
        kind: 'usage',
        title: 'Transferencia de datos (GB)',
        unitPriceMinor: 9, // USD 0,09
        evidence: { type: 'usage_report', meter: 'faro-transferencia-gb' },
      },
    ],
    periodCapMinor: USD(1_500),
    netDays: 15,
    earlyPayment: null,
    allowPartial: false,
    vendorResponseDays: 7,
    evidenceRuleText: 'Consumo del período según el medidor de Faro conectado a Recibido.',
  },
];

export function contract(id: string): Contract {
  const found = CONTRACTS.find((c) => c.id === id);
  if (!found) throw new Error(`unknown contract ${id}`);
  return found;
}
