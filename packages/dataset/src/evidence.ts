import type { EvidenceItem } from '@recibido/domain';

/**
 * Time entries of a vendor for one month: 8 h per weekday from the 1st until `hours` are
 * logged (the last day takes the remainder).
 */
function timeLog(
  vendorId: string,
  project: string,
  month: string, // '2026-09'
  hours: number,
  offset: string, // '-05:00'
  task: string,
): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  let left = hours * 60;
  for (let d = 1; left > 0; d++) {
    const date = new Date(`${month}-${String(d).padStart(2, '0')}T12:00:00Z`);
    if (date.toISOString().slice(0, 7) !== month)
      throw new Error(`${vendorId}: ${hours} h do not fit in ${month}`);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const day = date.toISOString().slice(0, 10);
    const minutes = Math.min(480, left);
    left -= minutes;
    out.push({
      id: `toggl-${vendorId}-${day}`,
      vendorId,
      source: 'toggl',
      origin: 'fixture',
      kind: 'time_entry',
      ref: project,
      title: task,
      url: null,
      occurredAt: `${day}T18:00:00${offset}`,
      minutes,
    });
  }
  return out;
}

function pr(
  vendorId: string,
  repo: string,
  number: number,
  title: string,
  kind: 'pr_merged' | 'pr_open',
  occurredAt: string,
  actor: string,
): EvidenceItem {
  return {
    id: `gh-${repo.split('/')[1]}-${number}`,
    vendorId,
    source: 'github',
    origin: 'fixture',
    kind,
    ref: `${repo}#${number}`,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    occurredAt,
    actor,
  };
}

const JULIAN_PRS: [number, string, string][] = [
  [41, 'Nuevo flujo de registro con verificación por correo', '2026-09-02'],
  [42, 'Tabla de movimientos con filtros por fecha', '2026-09-04'],
  [43, 'Modo oscuro en el panel', '2026-09-08'],
  [44, 'Pantalla de detalle de pago', '2026-09-10'],
  [45, 'Accesibilidad: foco visible y etiquetas en formularios', '2026-09-14'],
  [46, 'Carga diferida del historial', '2026-09-17'],
  [47, 'Exportar movimientos a CSV', '2026-09-21'],
  [48, 'Errores de red con reintento', '2026-09-24'],
  [49, 'Ajustes de diseño en móvil (390 px)', '2026-09-29'],
];

function deliverable(
  vendorId: string,
  ref: string,
  title: string,
  kind: 'deliverable_accepted' | 'deliverable_pending',
  occurredAt: string,
): EvidenceItem {
  return {
    id: `entregable-${ref}`,
    vendorId,
    source: 'entregables',
    origin: 'fixture',
    kind,
    ref,
    title,
    url: null,
    occurredAt,
    ...(kind === 'deliverable_accepted' ? { actor: 'Lina Cárdenas' } : {}),
  };
}

function ticket(
  ref: string,
  title: string,
  kind: 'ticket_closed' | 'ticket_open',
  occurredAt: string,
): EvidenceItem {
  return {
    id: `linear-${ref}`,
    vendorId: 'ximena-robles',
    source: 'linear',
    origin: 'fixture',
    kind,
    ref,
    title,
    url: `https://linear.app/altamar/issue/${ref}`,
    occurredAt,
    actor: 'Ximena Robles',
  };
}

function delivery(orderId: string, title: string, occurredAt: string): EvidenceItem {
  return {
    id: `entrega-${orderId}`,
    vendorId: 'mantenimientos-guadua',
    source: 'entregas',
    origin: 'fixture',
    kind: 'delivery_confirmed',
    ref: orderId,
    title,
    url: null,
    occurredAt,
    actor: 'Recepción, oficina de Medellín',
  };
}

function usage(
  vendorId: string,
  meter: string,
  id: string,
  title: string,
  quantity: string,
  occurredAt: string,
): EvidenceItem {
  return {
    id,
    vendorId,
    source: 'medidor',
    origin: 'fixture',
    kind: 'usage_report',
    ref: meter,
    title,
    url: null,
    occurredAt,
    quantity,
  };
}

/** The state of every evidence source before the script starts. */
export const EVIDENCE: EvidenceItem[] = [
  // Hourly contractors: August (billed in September) and September (billed in October)
  ...timeLog('daniela-ospina', 'api-pagos', '2026-08', 150, '-05:00', 'API de pagos'),
  ...timeLog('daniela-ospina', 'api-pagos', '2026-09', 92, '-05:00', 'API de pagos'),
  ...timeLog('julian-restrepo', 'app-web', '2026-08', 128, '-05:00', 'App web'),
  ...timeLog('julian-restrepo', 'app-web', '2026-09', 120, '-05:00', 'App web'),
  ...timeLog('thiago-moreira', 'data-warehouse', '2026-08', 124, '-03:00', 'Data warehouse'),
  ...timeLog('thiago-moreira', 'data-warehouse', '2026-09', 152, '-03:00', 'Data warehouse'),
  ...timeLog('renata-aguilar', 'qa-app-movil', '2026-08', 150, '-06:00', 'QA app móvil'),
  ...timeLog('renata-aguilar', 'qa-app-movil', '2026-09', 172, '-06:00', 'QA app móvil'),
  ...timeLog('beatriz-lima', 'pesquisa-usuarios', '2026-08', 80, '-03:00', 'Entrevistas'),
  ...timeLog('beatriz-lima', 'pesquisa-usuarios', '2026-09', 96, '-03:00', 'Entrevistas'),

  // Julián's merged PRs back his September hours (shown, not counted)
  ...JULIAN_PRS.map(([n, title, day]) =>
    pr(
      'julian-restrepo',
      'altamar-labs/app-web',
      n,
      title,
      'pr_merged',
      `${day}T16:00:00-05:00`,
      'julianrestrepo',
    ),
  ),

  // Andrés: M1 and M2 merged; M3 is open until it is merged live in the demo
  pr(
    'andres-villasenor',
    'altamar-labs/app-movil',
    1,
    'M1: autenticación con passkeys',
    'pr_merged',
    '2026-08-12T13:00:00-06:00',
    'avillasenor',
  ),
  pr(
    'andres-villasenor',
    'altamar-labs/app-movil',
    2,
    'M2: pagos dentro de la app',
    'pr_merged',
    '2026-09-08T17:30:00-06:00',
    'avillasenor',
  ),
  pr(
    'andres-villasenor',
    'altamar-labs/app-movil',
    3,
    'M3: notificaciones push',
    'pr_open',
    '2026-10-01T11:00:00-06:00',
    'avillasenor',
  ),

  // Estudio Ceiba and Estúdio Jabuti deliverables (accepted by Lina Cárdenas)
  deliverable(
    'estudio-ceiba',
    'iconos-app',
    'Sistema de íconos de la app',
    'deliverable_accepted',
    '2026-09-04T15:00:00-05:00',
  ),
  deliverable(
    'estudio-ceiba',
    'piezas-redes-sep',
    'Piezas para redes, campaña de septiembre',
    'deliverable_accepted',
    '2026-09-24T11:00:00-05:00',
  ),
  deliverable(
    'estudio-ceiba',
    'brand-kit-v2',
    'Brand kit v2',
    'deliverable_pending',
    '2026-09-30T18:00:00-05:00',
  ),
  deliverable(
    'estudio-ceiba',
    'landing-home',
    'Diseño de la landing',
    'deliverable_pending',
    '2026-10-01T10:00:00-05:00',
  ),
  deliverable(
    'estudio-jabuti',
    'ilustracoes-onboarding',
    'Ilustrações do onboarding (12 peças)',
    'deliverable_accepted',
    '2026-09-10T10:00:00-05:00',
  ),
  deliverable(
    'estudio-jabuti',
    'ilustracoes-blog',
    'Ilustrações para o blog (6 peças)',
    'deliverable_accepted',
    '2026-09-21T16:00:00-05:00',
  ),
  deliverable(
    'estudio-jabuti',
    'mascote-v1',
    'Mascote e variações',
    'deliverable_accepted',
    '2026-10-05T12:00:00-05:00',
  ),
  deliverable(
    'estudio-jabuti',
    'icones-ilustrados',
    'Ícones ilustrados (20 peças)',
    'deliverable_accepted',
    '2026-10-05T12:30:00-05:00',
  ),

  // Ximena's Linear tickets (ALT-214 closes during September)
  ticket('ALT-214', 'Motor de conciliación bancaria', 'ticket_open', '2026-08-18T10:00:00-06:00'),
  ticket('ALT-221', 'Webhooks de bancos', 'ticket_closed', '2026-09-17T19:00:00-06:00'),
  ticket('ALT-238', 'Reportes fiscales', 'ticket_closed', '2026-10-08T18:00:00-06:00'),

  // Mantenimientos Guadua deliveries signed at the Medellín office
  delivery('OC-0912', '12 sillas ergonómicas recibidas', '2026-09-12T10:30:00-05:00'),
  delivery('OC-0918', '6 purificadores de aire recibidos', '2026-09-19T09:15:00-05:00'),
  delivery('OC-0927', 'Cafetera industrial instalada', '2026-09-28T14:00:00-05:00'),
  delivery('OC-1001', '60 escritorios eléctricos recibidos', '2026-10-06T08:40:00-05:00'),
  delivery('OC-1010', '40 lámparas de escritorio recibidas', '2026-10-09T11:20:00-05:00'),
  delivery('OC-1014', 'Repuestos de sillas instalados', '2026-10-14T16:30:00-05:00'),

  // Usage meters
  usage(
    'faro-hosting',
    'faro-vcpu-horas',
    'medidor-faro-vcpu-2026-08',
    'Faro: vCPU-hora de agosto',
    '15800',
    '2026-08-31T23:00:00-05:00',
  ),
  usage(
    'faro-hosting',
    'faro-transferencia-gb',
    'medidor-faro-gb-2026-08',
    'Faro: GB transferidos en agosto',
    '2950',
    '2026-08-31T23:00:00-05:00',
  ),
  usage(
    'faro-hosting',
    'faro-vcpu-horas',
    'medidor-faro-vcpu-2026-09',
    'Faro: vCPU-hora de septiembre',
    '16500',
    '2026-09-30T23:00:00-05:00',
  ),
  usage(
    'faro-hosting',
    'faro-transferencia-gb',
    'medidor-faro-gb-2026-09',
    'Faro: GB transferidos en septiembre',
    '3200',
    '2026-09-30T23:00:00-05:00',
  ),
  usage(
    'palabra-viva',
    'palabras-traducidas',
    'medidor-palabra-viva-2026-08',
    'Palabras entregadas en agosto',
    '38400',
    '2026-08-31T18:00:00-06:00',
  ),
  usage(
    'palabra-viva',
    'palabras-traducidas',
    'medidor-palabra-viva-2026-09-lote-1',
    'Palabras entregadas en septiembre, lote 1 (app)',
    '41300',
    '2026-09-30T18:00:00-06:00',
  ),
];

/** Evidence that appears during the script (each one is an `evidence` step). */
export const SCRIPTED_EVIDENCE = {
  /** Thiago syncs two days he had logged offline (closes his August PAY_PART) */
  thiagoLateHours: {
    id: 'toggl-thiago-moreira-2026-08-carga-manual',
    vendorId: 'thiago-moreira',
    source: 'toggl',
    origin: 'fixture',
    kind: 'time_entry',
    ref: 'data-warehouse',
    title: 'Carga manual: migración de eventos (27 y 28 de agosto)',
    url: null,
    occurredAt: '2026-08-28T18:00:00-03:00',
    minutes: 960,
  },
  ximenaTicketClosed: ticket(
    'ALT-214',
    'Motor de conciliación bancaria',
    'ticket_closed',
    '2026-09-15T16:00:00-06:00',
  ),
  linaAcceptsBrandKit: deliverable(
    'estudio-ceiba',
    'brand-kit-v2',
    'Brand kit v2',
    'deliverable_accepted',
    '2026-10-05T14:00:00-05:00',
  ),
  palabraVivaSecondBatch: usage(
    'palabra-viva',
    'palabras-traducidas',
    'medidor-palabra-viva-2026-09-lote-2',
    'Palabras entregadas en septiembre, lote 2 (centro de ayuda)',
    '10700',
    '2026-09-30T18:00:00-06:00',
  ),
  /** merged live on GitHub during the demo; this fixture stands in for it in the eval */
  andresPrMerged: {
    ...pr(
      'andres-villasenor',
      'altamar-labs/app-movil',
      3,
      'M3: notificaciones push',
      'pr_merged',
      '2026-10-21T11:00:00-05:00',
      'avillasenor',
    ),
    origin: 'live',
  },
} satisfies Record<string, EvidenceItem>;
