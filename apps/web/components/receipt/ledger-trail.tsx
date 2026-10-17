import type { InvoiceDetail } from '@/lib/types';
import { fmtDateTime } from '../ui';

export const LEDGER_COPY: Record<string, string> = {
  ORG_SEEDED: 'Empresa creada',
  USER_REGISTERED: 'Persona registrada',
  POLICY_VERSION_CREATED: 'Nueva versión de la política',
  PAYEE_REGISTERED: 'Beneficiario registrado',
  PAYEE_UPDATED: 'Beneficiario actualizado',
  MANDATE_SIGNED: 'Acuerdo firmado',
  MANDATE_REVOKED: 'Acuerdo revocado',
  AGENT_REGISTERED: 'Agente externo autorizado',
  INVOICE_RECEIVED: 'Cobro recibido',
  INVOICE_EXTRACTED: 'Documento leído',
  DECISION_RECORDED: 'Decisión del agente',
  APPROVAL_REQUESTED: 'Aprobación solicitada',
  APPROVAL_GIVEN: 'Aprobación registrada',
  APPROVAL_REJECTED: 'Rechazo registrado',
  INVOICE_APPROVED: 'Pago autorizado por personas',
  PAYMENT_SCHEDULED: 'Transferencia programada',
  PAYMENT_SENT: 'Transferencia enviada',
  PAYMENT_SETTLED: 'Transferencia recibida',
  INVOICE_REJECTED: 'Cobro rechazado',
  PROPOSAL_CREATED: 'El agente propuso un acuerdo',
  PROPOSAL_ACCEPTED: 'Propuesta firmada',
  PROPOSAL_REJECTED: 'Propuesta rechazada',
  AUDIT_RUN: 'Auditoría',
};

/** The bill's entries in the hash-chained ledger. Hashes are data, so they are set in mono. */
export function LedgerTrail({ entries }: { entries: InvoiceDetail['ledger'] }) {
  return (
    <ol className="relative grid gap-3 border-l border-rule-strong pl-5">
      {entries.map((e) => (
        <li key={e.seq} className="relative">
          <span
            className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-sheet bg-brand"
            aria-hidden
          />
          <p className="text-[0.93rem] text-ink">
            {LEDGER_COPY[e.type] ?? e.type}
            <span className="text-ink-3">, {e.actor.name}</span>
          </p>
          <p className="text-xs text-ink-3">
            {fmtDateTime(e.at)}, asiento {e.seq}, huella{' '}
            <span className="font-mono">{e.hash.slice(0, 12)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}
