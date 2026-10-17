/** The fictitious customer: a US entity that pays contractors in Colombia, Mexico and Brazil. */
export const COMPANY = {
  id: 'altamar' as const,
  name: 'Altamar Labs Inc.' as const,
  legalName: 'Altamar Labs Inc.',
  country: 'US' as const,
  taxId: '88-4127730',
  billingEmail: 'cuentas@altamarlabs.com',
  people: [
    { id: 'paula-herrera', name: 'Paula Herrera', role: 'Finanzas, opera Recibido' },
    { id: 'diego-navarro', name: 'Diego Navarro', role: 'CFO, aprueba escalaciones' },
    { id: 'lina-cardenas', name: 'Lina Cárdenas', role: 'Product manager, acepta entregables' },
  ],
};

/** Simulated time when the demo starts (September, before the first bill). */
export const DEMO_START = '2026-09-01T08:00:00-05:00';
