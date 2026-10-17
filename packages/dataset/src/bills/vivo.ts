/**
 * Files for the live demo (October 2026, real clock): drag them onto the inbox on stage.
 */
import type { DatasetBill } from '../types';
import { entry } from './entry';
import { lexia, tablero, valentina } from './parties';

const P = '2026-10';

export const LIVE: DatasetBill[] = [
  entry({
    id: 'vivo-01',
    slug: 'valentina-cuenta-de-cobro-octubre',
    period: null,
    receivedAt: '2026-10-16T11:00:00-05:00',
    source: 'upload',
    title: 'Cuenta de cobro de Valentina — octubre',
    note: 'Con la llave nueva, ya actualizada en el registro: se paga sola.',
    trap: null,
    truth: valentina({
      number: 'CC-2026-10',
      issueDate: '2026-10-01',
      servicePeriod: P,
      destination: '@valentina.rios',
    }),
    document: {
      format: 'pdf',
      template: 'cuenta_cobro_co',
      extras: { signature: 'Valentina Ríos M.' },
    },
    expected: { outcome: 'PAY', failing: [] },
  }),
  entry({
    id: 'vivo-02',
    slug: 'tablero-email-octubre',
    period: null,
    receivedAt: '2026-10-16T11:05:00-05:00',
    source: 'email',
    title: 'Suscripción Tablero.io — octubre',
    note: 'El acuerdo ajustado en agosto sigue funcionando.',
    trap: null,
    truth: tablero({
      number: 'TB-2026-10',
      issueDate: '2026-10-01',
      dueDate: '2026-10-15',
      servicePeriod: P,
      seats: 50,
      unit: '12.40',
      total: '620.00',
    }),
    document: {
      format: 'eml',
      email: {
        fromName: 'Tablero.io Billing',
        fromAddress: 'billing@tablero.example',
        subject: 'Your Tablero.io invoice TB-2026-10',
        body: [
          'Hi Andes Labs team,',
          '',
          'Here is your invoice for October 2026.',
          '',
          'Invoice: TB-2026-10',
          'Issued: October 1, 2026 · Due: October 15, 2026',
          'Bill to: Andes Labs Inc. (EIN 88-1234567)',
          'From: Tablero Software LLC (EIN 87-7654321)',
          '',
          'Tablero Team plan — 50 seats (October 2026)   50 × USD 12.40   USD 620.00',
          'Total due: USD 620.00',
          '',
          'This amount will be charged to your Visa card ending in 4421.',
        ].join('\n'),
        attachPdf: false,
      },
    },
    expected: { outcome: 'PAY', failing: [] },
  }),
  entry({
    id: 'vivo-03',
    slug: 'lexia-legal-octubre',
    period: null,
    receivedAt: '2026-10-16T11:10:00-05:00',
    source: 'upload',
    title: 'Honorarios de Lexia Legal — octubre',
    note: 'Sin acuerdo firmado: llega a la cola de aprobación con el resumen arriba.',
    trap: null,
    truth: lexia({
      number: 'LX-2026-140',
      issueDate: '2026-10-14',
      dueDate: '2026-10-29',
      servicePeriod: P,
      description: 'Asesoría legal: términos y condiciones del nuevo producto',
      subtotal: '2521008.40',
      iva: '478991.60',
      words: { text: 'Tres millones de pesos m/cte', value: '3000000' },
    }),
    document: { format: 'pdf', template: 'factura_co' },
    expected: { outcome: 'ESCALATE', failing: ['mandate.exists'] },
  }),
];
