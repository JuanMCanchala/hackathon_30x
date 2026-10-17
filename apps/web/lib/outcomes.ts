import type { InvoiceStatus, Outcome } from './types';

/** Copy for the three outcomes. Same words everywhere (UI, toasts, receipts). */
export const OUTCOME_COPY: Record<Outcome, { short: string; long: string; stamp: string }> = {
  PAY: { short: 'Pagada sola', long: 'El agente la pagó', stamp: 'Pagada sola' },
  HOLD: { short: 'Frenada', long: 'El agente la frenó', stamp: 'Frenada' },
  ESCALATE: {
    short: 'Necesita aprobación',
    long: 'El agente pidió aprobación',
    stamp: 'Por aprobar',
  },
};

export const STATUS_COPY: Record<InvoiceStatus, string> = {
  RECEIVED: 'Recibida',
  PAID: 'Pagada sola',
  HELD: 'Frenada',
  PENDING_APPROVAL: 'Por aprobar',
  APPROVED: 'Pagada con aprobación',
  REJECTED: 'Rechazada',
};

export type Tone = 'paid' | 'held' | 'pending' | 'rejected';

export function toneOf(status: InvoiceStatus): Tone {
  switch (status) {
    case 'PAID':
    case 'APPROVED':
      return 'paid';
    case 'HELD':
      return 'held';
    case 'REJECTED':
      return 'rejected';
    default:
      return 'pending';
  }
}

export function toneOfOutcome(outcome: Outcome): Tone {
  return outcome === 'PAY' ? 'paid' : outcome === 'HOLD' ? 'held' : 'pending';
}

export const SOURCE_COPY: Record<string, string> = {
  upload: 'Subida',
  email: 'Correo',
  chat: 'WhatsApp',
  agent: 'Agente',
  dataset: 'Set de datos',
  attack: 'Ataque',
};
