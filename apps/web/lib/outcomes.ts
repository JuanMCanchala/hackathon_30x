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

/** The agent's reason without its verdict: "Necesita aprobación. No hay…" → "no hay…". */
export function agentReason(summary: string): string {
  const reason = summary.replace(/^(Necesita aprobación|Frenada|Pagada sola)\.\s*/, '');
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(reason)
    ? reason.charAt(0).toLowerCase() + reason.slice(1)
    : reason;
}

/**
 * What a list or a receipt says about a bill a person settled: the person's decision first,
 * then the agent's reason for asking, so "Pagada con aprobación" never sits next to a bare
 * "Necesita aprobación".
 */
export function settledSummary(
  status: InvoiceStatus,
  by: string | null,
  summary: string | null,
): string | null {
  if (!summary) return null;
  if (status !== 'APPROVED' && status !== 'REJECTED') return summary;
  const verdict = status === 'APPROVED' ? 'Aprobada' : 'Rechazada';
  return `${verdict}${by ? ` por ${by}` : ' por una persona'}. El agente había pedido aprobación: ${agentReason(summary)}`;
}
