/**
 * September 2026: a normal month that gives October its history (paid caps, invoice numbers,
 * milestones already paid). Hourly and usage bills charge August; subscriptions charge September.
 */
import { bill, PAID_BY_AGENT, type BillInput } from './build';
import type { BillSpec } from './types';

const AUGUST: [string, string] = ['2026-08-01', '2026-08-31'];
const SEPTEMBER: [string, string] = ['2026-09-01', '2026-09-30'];

const sep = (input: BillInput) => bill('septiembre', input);

const danielaAugust = {
  vendorId: 'daniela-ospina',
  invoiceNumber: 'DO-2026-08',
  issueDate: '2026-09-01',
  period: AUGUST,
  currency: 'COP',
  lines: [
    {
      description: 'Desarrollo backend API de pagos — agosto 2026',
      termId: 'ospina-horas',
      unit: 'hour',
      quantity: '150',
      unitPrice: '130000.00',
    },
  ],
  payoutDetails: 'Llave Bre-B 315 789 4512',
} satisfies Partial<BillInput>;

const faroAugust = {
  vendorId: 'faro-hosting',
  invoiceNumber: 'FH-10482',
  issueDate: '2026-09-01',
  period: AUGUST,
  currency: 'USD',
  lines: [
    {
      description: 'Compute (vCPU-hours), August 2026',
      termId: 'faro-vcpu',
      unit: 'unit',
      quantity: '15800',
      unitPrice: '0.04',
    },
    {
      description: 'Data transfer (GB), August 2026',
      termId: 'faro-transferencia',
      unit: 'unit',
      quantity: '2950',
      unitPrice: '0.09',
    },
  ],
} satisfies Partial<BillInput>;

const andresM2 = {
  vendorId: 'andres-villasenor',
  currency: 'MXN',
  lines: [
    {
      description: 'Hito M2: pagos dentro de la app (PR #2)',
      termId: 'villasenor-m2',
      unit: 'milestone',
      quantity: '1',
      unitPrice: '74000.00',
    },
  ],
  payoutDetails: 'CLABE 012180015678901230',
} satisfies Partial<BillInput>;

const beatrizAugust = {
  vendorId: 'beatriz-lima',
  invoiceNumber: 'BL-012',
  currency: 'BRL',
  lines: [
    {
      description: 'Pesquisa com usuários: entrevistas e síntese',
      termId: 'lima-horas',
      unit: 'hour',
      quantity: '80',
      unitPrice: '150.00',
    },
  ],
  payoutDetails: 'Chave Pix: beatriz@limapesquisa.com.br',
} satisfies Partial<BillInput>;

export const SEPTEMBER_BILLS: BillSpec[] = [
  sep({
    id: 'sep-01',
    slug: 'trazo-cloud-invoice',
    channel: 'pdf',
    vendorId: 'trazo-cloud',
    invoiceNumber: 'TC-2026-0901',
    issueDate: '2026-09-01',
    period: SEPTEMBER,
    currency: 'USD',
    lines: [
      {
        description: 'Team plan, 25 seats — September 2026',
        termId: 'trazo-plan-equipo',
        unit: 'month',
        quantity: '1',
        unitPrice: '1200.00',
      },
    ],
    payoutDetails: 'ACH, account ending 0021',
    expected: PAID_BY_AGENT,
    story:
      'Trazo Cloud cobra la suscripción de septiembre del plan Equipo según el cronograma firmado: se paga sola.',
  }),
  sep({
    id: 'sep-02',
    slug: 'cardumen-digital-factura',
    channel: 'pdf',
    vendorId: 'cardumen-digital',
    invoiceNumber: 'CD-0457',
    issueDate: '2026-09-01',
    period: SEPTEMBER,
    currency: 'COP',
    lines: [
      {
        description: 'Gestión de pauta y contenidos — septiembre 2026',
        termId: 'cardumen-mensual',
        unit: 'month',
        quantity: '1',
        unitPrice: '6800000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: @cardumendigital',
    expected: PAID_BY_AGENT,
    story:
      'Cardumen Digital cobra la tarifa fija de septiembre; el contrato no exige evidencia y se paga sola.',
  }),
  sep({
    ...danielaAugust,
    id: 'sep-03',
    slug: 'daniela-ospina-cuenta-de-cobro',
    channel: 'pdf',
    expected: PAID_BY_AGENT,
    story:
      'Daniela Ospina cobra 150 h de agosto y Toggl tiene las 150 h registradas: se paga sola.',
  }),
  sep({
    id: 'sep-04',
    slug: 'julian-restrepo-cuenta-de-cobro',
    channel: 'pdf',
    vendorId: 'julian-restrepo',
    invoiceNumber: 'JR-2026-08',
    issueDate: '2026-09-02',
    period: AUGUST,
    currency: 'COP',
    lines: [
      {
        description: 'Desarrollo frontend app web — agosto 2026',
        termId: 'restrepo-horas',
        unit: 'hour',
        quantity: '128',
        unitPrice: '110000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: julian@restrepoarango.dev',
    expected: PAID_BY_AGENT,
    story: 'Julián Restrepo cobra 128 h de agosto, todas registradas en Toggl: se paga sola.',
  }),
  sep({
    ...faroAugust,
    id: 'sep-05',
    slug: 'faro-hosting-correo',
    channel: 'email',
    payoutDetails: 'New bank account: routing 071000013, account 558322109934',
    body: [
      'Hello Altamar team,',
      '',
      'Please find attached invoice FH-10482 for your August usage.',
      '',
      'Important: we moved banks. Our new bank account for this and future payments is routing 071000013, account 558322109934. Please update your records before paying.',
      '',
      'Thanks,',
      'Faro Hosting Billing',
    ].join('\n'),
    expected: { first: 'ESCALATE', final: 'REJECTED', resolvedBy: 'person' },
    story:
      'Llega por correo una factura de Faro Hosting que pide pagar a una cuenta bancaria nueva: se escala y Diego confirma con Faro que el correo era falso.',
  }),
  sep({
    ...faroAugust,
    id: 'sep-06',
    slug: 'faro-hosting-invoice',
    channel: 'pdf',
    payoutDetails: 'ACH, account ending 9834',
    expected: PAID_BY_AGENT,
    story:
      'Llega en PDF la factura auténtica de agosto de Faro Hosting, con el mismo número; el consumo coincide con su medidor y se paga sola.',
  }),
  sep({
    id: 'sep-07',
    slug: 'thiago-moreira-fatura',
    channel: 'pdf',
    vendorId: 'thiago-moreira',
    invoiceNumber: 'TM-2026-08',
    issueDate: '2026-09-03',
    period: AUGUST,
    currency: 'BRL',
    lines: [
      {
        description: 'Engenharia de dados — agosto de 2026',
        termId: 'moreira-horas',
        unit: 'hour',
        quantity: '140',
        unitPrice: '180.00',
      },
    ],
    payoutDetails: 'Chave Pix: 7f3c2a91-4b6e-4d8a-9c1f-2e5b8d0a6c34',
    expected: { first: 'PAY_PART', final: 'PAID', resolvedBy: 'vendor' },
    story:
      'Thiago Moreira cobra 140 h de agosto con 124 h en Toggl: se pagan las 124 h y, cuando sincroniza las 16 h que faltaban, se paga el resto.',
  }),
  sep({
    id: 'sep-08',
    slug: 'renata-aguilar-factura',
    channel: 'pdf',
    vendorId: 'renata-aguilar',
    invoiceNumber: 'RA-0018',
    issueDate: '2026-09-02',
    period: AUGUST,
    currency: 'MXN',
    lines: [
      {
        description: 'Pruebas de QA de la app móvil — agosto 2026',
        termId: 'aguilar-horas',
        unit: 'hour',
        quantity: '150',
        unitPrice: '520.00',
      },
    ],
    payoutDetails: 'CLABE: 0021 8007 0123 4567 80',
    expected: PAID_BY_AGENT,
    story:
      'Renata Aguilar cobra 150 h de QA de agosto; su factura trae la misma CLABE registrada, así que no se escala y se paga sola.',
  }),
  sep({
    ...beatrizAugust,
    id: 'sep-09',
    slug: 'beatriz-lima-fatura',
    channel: 'pdf',
    issueDate: '2026-09-03',
    expected: { first: 'ASK_VENDOR', final: 'PAID', resolvedBy: 'vendor' },
    story:
      'Beatriz Lima cobra 80 h sin decir de qué período: Recibido le pide el período y ella responde con la fatura corregida.',
  }),
  sep({
    ...beatrizAugust,
    id: 'sep-09-r1',
    slug: 'beatriz-lima-fatura-corrigida',
    channel: 'portal',
    issueDate: '2026-09-07',
    period: AUGUST,
    revisionOf: 'BL-012',
    revisionOfBillId: 'sep-09',
    expected: { first: 'PAY', final: 'PAID', resolvedBy: 'vendor' },
    story:
      'La fatura corregida de Beatriz trae el período de agosto y las 80 h están registradas: se paga sin una persona.',
  }),
  sep({
    id: 'sep-10',
    slug: 'palabra-viva-factura',
    channel: 'pdf',
    vendorId: 'palabra-viva',
    invoiceNumber: 'PV-0821',
    issueDate: '2026-09-02',
    period: AUGUST,
    currency: 'MXN',
    lines: [
      {
        description: 'Traducción ES → PT/EN, agosto 2026 (palabras)',
        termId: 'palabra-viva-palabras',
        unit: 'unit',
        quantity: '38400',
        unitPrice: '1.10',
      },
    ],
    payoutDetails: 'CLABE 014180065432198761',
    expected: PAID_BY_AGENT,
    story:
      'Palabra Viva cobra 38.400 palabras traducidas en agosto, las mismas del reporte de la plataforma: se paga sola.',
  }),
  sep({
    ...danielaAugust,
    id: 'sep-11',
    slug: 'daniela-ospina-reenvio',
    channel: 'email',
    body: [
      'Hola Paula,',
      '',
      'Te reenvío mi cuenta de cobro de agosto por si no te había llegado.',
      '',
      '¡Gracias!',
      'Daniela',
    ].join('\n'),
    expected: { first: 'HOLD', final: 'HELD', resolvedBy: 'agent' },
    story:
      'Daniela reenvía por correo la misma cuenta de cobro de agosto: Recibido la retiene para no pagarla dos veces.',
  }),
  sep({
    id: 'sep-12',
    slug: 'estudio-ceiba-cuenta-de-cobro',
    channel: 'pdf',
    vendorId: 'estudio-ceiba',
    invoiceNumber: 'EC-0231',
    issueDate: '2026-09-07',
    currency: 'COP',
    lines: [
      {
        description: 'Sistema de íconos de la app',
        termId: 'ceiba-iconos',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '8500000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: @estudioceiba',
    expected: PAID_BY_AGENT,
    story:
      'Estudio Ceiba cobra el sistema de íconos, que Lina aceptó el 4 de septiembre: se paga sola.',
  }),
  sep({
    ...andresM2,
    id: 'sep-13',
    slug: 'andres-villasenor-factura',
    channel: 'pdf',
    invoiceNumber: 'AV-2026-04',
    issueDate: '2026-09-09',
    expected: PAID_BY_AGENT,
    story:
      'Andrés Villaseñor cobra el hito M2 y su PR #2 está fusionado en altamar-labs/app-movil: se paga solo.',
  }),
  sep({
    id: 'sep-14',
    slug: 'ximena-robles-factura',
    channel: 'pdf',
    vendorId: 'ximena-robles',
    invoiceNumber: 'XR-0007',
    issueDate: '2026-09-10',
    currency: 'MXN',
    lines: [
      {
        description: 'Motor de conciliación bancaria (ALT-214)',
        termId: 'robles-conciliacion',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '58000.00',
      },
    ],
    payoutDetails: 'CLABE 072180044556677888',
    expected: { first: 'ASK_VENDOR', final: 'PAID', resolvedBy: 'vendor' },
    story:
      'Ximena Robles cobra el motor de conciliación con el ticket ALT-214 aún abierto: Recibido le escribe y paga cuando el ticket se cierra.',
  }),
  sep({
    id: 'sep-15',
    slug: 'estudio-jabuti-fatura',
    channel: 'pdf',
    vendorId: 'estudio-jabuti',
    invoiceNumber: 'JAB-2026-031',
    issueDate: '2026-09-11',
    currency: 'BRL',
    lines: [
      {
        description: 'Ilustrações do onboarding (12 peças)',
        termId: 'jabuti-onboarding',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '9600.00',
      },
    ],
    payoutDetails: 'Chave Pix: CNPJ 12345678000190',
    expected: PAID_BY_AGENT,
    story: 'Estúdio Jabuti cobra las ilustraciones del onboarding, que Lina aceptó: se paga sola.',
  }),
  sep({
    id: 'sep-16',
    slug: 'mantenimientos-guadua-factura',
    channel: 'pdf',
    vendorId: 'mantenimientos-guadua',
    invoiceNumber: 'MG-1187',
    issueDate: '2026-09-14',
    currency: 'COP',
    lines: [
      {
        description: 'Sillas ergonómicas (OC-0912)',
        termId: 'guadua-oc-0912',
        unit: 'unit',
        quantity: '12',
        unitPrice: '780000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: NIT 900.456.789-4',
    expected: PAID_BY_AGENT,
    story:
      'Mantenimientos Guadua cobra 12 sillas de la orden OC-0912 con la entrega firmada en recepción: se paga sola.',
  }),
  sep({
    ...andresM2,
    id: 'sep-17',
    slug: 'andres-villasenor-correo',
    channel: 'email',
    invoiceNumber: 'AV-2026-05',
    issueDate: '2026-09-16',
    body: [
      'Hola, buen día.',
      '',
      'Les comparto la factura AV-2026-05 del hito M2. Quedo atento.',
      '',
      'Saludos,',
      'Andrés',
    ].join('\n'),
    expected: { first: 'HOLD', final: 'HELD', resolvedBy: 'agent' },
    story:
      'Andrés vuelve a cobrar el hito M2 con otro número de factura: es trabajo ya pagado y Recibido lo retiene.',
  }),
  sep({
    id: 'sep-18',
    slug: 'ximena-robles-factura',
    channel: 'pdf',
    vendorId: 'ximena-robles',
    invoiceNumber: 'XR-0008',
    issueDate: '2026-09-18',
    currency: 'MXN',
    lines: [
      {
        description: 'Webhooks de bancos (ALT-221)',
        termId: 'robles-webhooks',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '34000.00',
      },
    ],
    payoutDetails: 'CLABE 072180044556677888',
    expected: PAID_BY_AGENT,
    story: 'Ximena cobra los webhooks de bancos con el ticket ALT-221 ya cerrado: se paga sola.',
  }),
  sep({
    id: 'sep-19',
    slug: 'mantenimientos-guadua-factura',
    channel: 'pdf',
    vendorId: 'mantenimientos-guadua',
    invoiceNumber: 'MG-1193',
    issueDate: '2026-09-21',
    currency: 'COP',
    lines: [
      {
        description: 'Purificadores de aire (OC-0918)',
        termId: 'guadua-oc-0918',
        unit: 'unit',
        quantity: '6',
        unitPrice: '690000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: NIT 900.456.789-4',
    expected: PAID_BY_AGENT,
    story:
      'Mantenimientos Guadua cobra 6 purificadores de aire recibidos en la oficina: se paga sola.',
  }),
  sep({
    id: 'sep-20',
    slug: 'estudio-jabuti-fatura',
    channel: 'pdf',
    vendorId: 'estudio-jabuti',
    invoiceNumber: 'JAB-2026-034',
    issueDate: '2026-09-22',
    currency: 'BRL',
    lines: [
      {
        description: 'Ilustrações para o blog (6 peças)',
        termId: 'jabuti-blog',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '2700.00',
      },
    ],
    payoutDetails: 'Chave Pix: CNPJ 12345678000190',
    expected: PAID_BY_AGENT,
    story:
      'Estúdio Jabuti cobra las ilustraciones del blog, aceptadas el día anterior: se paga sola.',
  }),
  sep({
    id: 'sep-21',
    slug: 'estudio-ceiba-cuenta-de-cobro',
    channel: 'pdf',
    vendorId: 'estudio-ceiba',
    invoiceNumber: 'EC-0236',
    issueDate: '2026-09-25',
    currency: 'COP',
    lines: [
      {
        description: 'Piezas para redes, campaña de septiembre',
        termId: 'ceiba-piezas-sep',
        unit: 'milestone',
        quantity: '1',
        unitPrice: '6200000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: @estudioceiba',
    expected: PAID_BY_AGENT,
    story:
      'Estudio Ceiba cobra las piezas de la campaña de septiembre, aceptadas por Lina: se paga sola.',
  }),
  sep({
    id: 'sep-22',
    slug: 'mantenimientos-guadua-factura',
    channel: 'pdf',
    vendorId: 'mantenimientos-guadua',
    invoiceNumber: 'MG-1201',
    issueDate: '2026-09-29',
    currency: 'COP',
    lines: [
      {
        description: 'Cafetera industrial (OC-0927)',
        termId: 'guadua-oc-0927',
        unit: 'unit',
        quantity: '1',
        unitPrice: '4200000.00',
      },
    ],
    payoutDetails: 'Llave Bre-B: NIT 900.456.789-4',
    expected: PAID_BY_AGENT,
    story:
      'Mantenimientos Guadua cobra la cafetera industrial instalada el 28 de septiembre: se paga sola.',
  }),
];
