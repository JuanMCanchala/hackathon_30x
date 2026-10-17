'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/** The demo's person who decides escalations (in production the admin token's actor acts). */
export const DEMO_APPROVER = 'Diego Navarro';

type Action = 'approve' | 'reject';

/**
 * Approve or reject an escalated bill, confirmed inline (never a browser dialog). Approving pays
 * what the case still owes, only to the vendor's registered destination.
 */
export function ResolvePanel({
  billId,
  owedMinor,
  unevidencedMinor,
  currency,
  destination,
  amountUncertain,
  onDone,
}: {
  billId: string;
  owedMinor: number;
  /** what the bill charges beyond its evidence (a person may approve it anyway) */
  unevidencedMinor: number;
  currency: Currency | null;
  destination: string | null;
  /** the reader did not read the total or its currency with certainty: the API refuses approval */
  amountUncertain: boolean;
  onDone: () => void;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(action: Action) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/bills/${encodeURIComponent(billId)}/resolve`, {
        action,
        actor: DEMO_APPROVER,
        note,
      });
      setPending(null);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo resolver la cuenta.');
    } finally {
      setBusy(false);
    }
  }

  const amount =
    !amountUncertain && currency && owedMinor > 0 ? formatMoney(owedMinor, currency) : null;
  const unproven =
    amount && unevidencedMinor > 0
      ? formatMoney(Math.min(unevidencedMinor, owedMinor), currency!)
      : null;

  return (
    <section
      aria-labelledby="decidir"
      className="sheet grid gap-4 border-escalate/40 px-4 py-4 sm:px-5"
    >
      <div>
        <h2 id="decidir" className="t-h3">
          Te toca decidir
        </h2>
        <p className="mt-1 text-ink-2">
          Actúas como <strong className="text-ink">{DEMO_APPROVER}</strong>, aprobador de Altamar.
          {amount && (
            <>
              {' '}
              Aprobar paga <span className="t-mono text-ink">{amount}</span>
              {unproven && (
                <>
                  {' '}
                  (de esto, <span className="t-mono text-ink">{unproven}</span> sin evidencia)
                </>
              )}
              {destination && (
                <>
                  {' '}
                  a <span className="t-mono text-ink">{destination}</span>
                </>
              )}
              , el destino registrado; nada de la cuenta lo cambia.
            </>
          )}
        </p>
      </div>
      {pending === null ? (
        <div className="grid gap-3">
          {amountUncertain && (
            <p className="rounded-[6px] bg-escalate-tint px-3 py-2 text-[0.9375rem] text-ink">
              No se puede aprobar: no se leyó con certeza el monto o la moneda. Pide la cuenta
              formal o recházala.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!amountUncertain && (
              <Button onClick={() => setPending('approve')}>Aprobar el pago</Button>
            )}
            <Button variant="secondary" onClick={() => setPending('reject')}>
              Rechazar
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-[0.875rem] font-[650]">
            Nota para el historial (opcional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="rounded-[6px] border border-rule-strong bg-sheet px-3 py-2 font-[450] text-ink"
              placeholder={
                pending === 'approve'
                  ? 'Por qué la apruebas'
                  : 'Por qué la rechazas (el proveedor no lo ve)'
              }
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy} onClick={() => void submit(pending)}>
              {pending === 'reject'
                ? 'Sí, rechazar'
                : amount
                  ? 'Sí, aprobar y pagar'
                  : 'Sí, aprobar'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancelar
            </Button>
            {busy && <span className="text-[0.875rem] text-ink-3">Guardando…</span>}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[0.875rem] font-[650] text-escalate">
          {error}
        </p>
      )}
    </section>
  );
}
