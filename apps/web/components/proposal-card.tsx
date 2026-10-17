'use client';

import clsx from 'clsx';
import { PenLine, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { formatUsd } from '@mandato/domain';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { ProposalView } from '@/lib/types';
import { Button, Textarea, fmtDateTime } from './ui';

type ProposalLike = Pick<ProposalView, 'id' | 'status' | 'draft' | 'impact'> &
  Partial<
    Pick<
      ProposalView,
      'invoiceId' | 'invoiceRef' | 'invoiceTitle' | 'createdAt' | 'resolvedBy' | 'resolutionNote'
    >
  >;

/** The agent's proposal: a mandate change a person signs or rejects (ADR-0004). */
export function ProposalCard({ proposal, compact }: { proposal: ProposalLike; compact?: boolean }) {
  const { session } = useSession();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const d = proposal.draft;
  const canSign = session?.user.canSign;

  const act = async (action: 'accept' | 'reject') => {
    setBusy(action);
    try {
      await post(
        `/api/v1/proposals/${proposal.id}/${action}`,
        action === 'reject' ? { note: note || null } : undefined,
      );
      toast(action === 'accept' ? 'Acuerdo firmado' : 'Propuesta rechazada', {
        description:
          action === 'accept'
            ? 'Desde ahora el agente paga solo lo que cabe en este acuerdo.'
            : 'Nada cambió en las reglas.',
      });
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo registrar la decisión.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <article
      className={clsx(
        'sheet relative overflow-hidden',
        proposal.status === 'pending' && 'border-brand/50 ring-1 ring-brand/20',
      )}
    >
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <PenLine className="size-4 text-brand" aria-hidden />
              {proposal.status === 'pending'
                ? 'El agente propone'
                : proposal.status === 'accepted'
                  ? `Firmado${proposal.resolvedBy ? ` por ${proposal.resolvedBy}` : ''}`
                  : `Rechazado${proposal.resolvedBy ? ` por ${proposal.resolvedBy}` : ''}`}
              {proposal.createdAt && (
                <span className="text-ink-3">{fmtDateTime(proposal.createdAt)}</span>
              )}
            </p>
            <h3 className="t-h3 mt-1 text-ink">{d.title}</h3>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-3">Exposición máxima</p>
            <p className="t-figure text-lg text-ink">
              {formatUsd(d.exposureUsdCentsPerMonth)} al mes
            </p>
          </div>
        </div>

        {!compact && <p className="voice text-ink-2">{d.rationale}</p>}

        <dl className="divide-y divide-rule overflow-hidden rounded-[14px] bg-sheet-2">
          {d.changes.map((c) => (
            <div
              key={c.label}
              className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-3 px-3.5 py-2.5 text-sm sm:grid-cols-[12rem_1fr]"
            >
              <dt className="text-ink-3">{c.label}</dt>
              <dd className="text-ink">
                {c.from && (
                  <span className="text-ink-3 line-through decoration-ink-3/60">{c.from}</span>
                )}
                {c.from && <span className="mx-2 text-ink-3">por</span>}
                <span className="font-[600]">{c.to}</span>
              </dd>
            </div>
          ))}
        </dl>

        {d.warnings.map((w) => (
          <p
            key={w}
            className="flex gap-2 rounded-lg bg-pending-tint/70 px-3 py-2 text-sm text-ink"
          >
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-pending" aria-hidden />
            {w}
          </p>
        ))}

        <p className="text-sm text-ink-3">
          {proposal.impact.avoidedEscalations > 0
            ? `Con este acuerdo, ${proposal.impact.avoidedEscalations} ${proposal.impact.avoidedEscalations === 1 ? 'cobro que pidió aprobación se habría pagado solo' : 'cobros que pidieron aprobación se habrían pagado solos'}.`
            : 'Aplica a los próximos cobros de este beneficiario.'}
          {proposal.invoiceRef && proposal.invoiceId && (
            <>
              {' '}
              Nació de{' '}
              <Link href={`/facturas/${proposal.invoiceId}`} className="text-brand hover:underline">
                {proposal.invoiceRef}
              </Link>
              .
            </>
          )}
        </p>

        {proposal.resolutionNote && <p className="voice text-ink-2">«{proposal.resolutionNote}»</p>}

        {proposal.status === 'pending' &&
          (canSign ? (
            rejecting ? (
              <div className="grid gap-2">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="¿Por qué no lo firmas? (queda en el registro)"
                  aria-label="Motivo del rechazo"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={() => act('reject')}
                    loading={busy === 'reject'}
                  >
                    Rechazar propuesta
                  </Button>
                  <Button variant="ghost" onClick={() => setRejecting(false)}>
                    Volver
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => act('accept')}
                  loading={busy === 'accept'}
                  disabled={busy !== null}
                >
                  Firmar acuerdo
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejecting(true)}
                  disabled={busy !== null}
                >
                  No firmar
                </Button>
              </div>
            )
          ) : (
            <p className="text-sm text-ink-2">
              Solo Martín o Sofía pueden firmar acuerdos. Cambia de usuario en el menú.
            </p>
          ))}
      </div>
    </article>
  );
}
