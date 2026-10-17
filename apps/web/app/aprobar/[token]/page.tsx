'use client';

import clsx from 'clsx';
import { CircleCheck, CircleSlash, Clock, TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatMoney, formatUsd } from '@mandato/domain';
import { Logo } from '@/components/brand';
import { Button, Textarea } from '@/components/ui';

interface LinkView {
  approver: { id: string; name: string };
  expiresAt: string;
  usedAt: string | null;
  expired: boolean;
  invoice: {
    id: string;
    ref: string;
    title: string | null;
    status: string;
    payee: { name: string; country: string } | null;
    issuerName: string | null;
    invoiceNumber: string | null;
    amountMinor: number | null;
    currency: string | null;
    usdCents: number | null;
    dueDate: string | null;
    summary: string | null;
    counterfactual: string[];
    failing: { title: string; detail: string }[];
    approval: {
      required: number;
      approvals: { name: string; action: string; at: string }[];
    } | null;
  };
}

type Phase = 'loading' | 'ready' | 'invalid' | 'done';

/** One-tap approval from the phone (ADR-0012): a cheque-like card, summary on top, two buttons. */
export default function AprobarPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<LinkView | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [result, setResult] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    fetch(`/api/v1/approval-links/${token}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error?.message ?? 'El enlace no es válido.');
        setView(body as LinkView);
        setPhase('ready');
      })
      .catch((e: Error) => {
        setMessage(e.message);
        setPhase('invalid');
      });
  }, [token]);

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action);
    try {
      const response = await fetch(`/api/v1/approval-links/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, note: note || null }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? 'No se pudo registrar.');
      setResult(action);
      setPhase('done');
    } catch (e) {
      setMessage((e as Error).message);
      setPhase('invalid');
    } finally {
      setBusy(null);
    }
  };

  const inv = view?.invoice;
  const blocked = view && (view.usedAt || view.expired || inv?.status !== 'PENDING_APPROVAL');
  // The summary already states the main reason; list only the ones it does not.
  const others =
    inv?.failing.filter((f) => !inv.summary?.includes(f.detail.replace(/\.$/, ''))) ?? [];

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-start gap-6 px-4 py-6">
      <Logo />
      {phase === 'loading' && <p className="text-ink-2">Abriendo el cobro…</p>}

      {phase === 'invalid' && (
        <div className="sheet grid gap-2 p-6">
          <p className="t-h3 text-ink">Este enlace no se puede usar</p>
          <p className="text-ink-2">{message}</p>
          <p className="text-sm text-ink-3">
            Pide uno nuevo desde Mandato: cada enlace sirve una sola vez.
          </p>
        </div>
      )}

      {view && inv && phase !== 'invalid' && (
        <>
          <article
            className={clsx(
              'pass pass-in',
              phase === 'done'
                ? result === 'approve'
                  ? 'pass-paid'
                  : 'pass-held'
                : 'pass-pending',
            )}
          >
            <div className="relative z-10 grid gap-5 p-6">
              <p className="text-[0.88rem] font-[560] text-white/85">
                {view.approver.name}, este cobro espera tu aprobación. Comprobante {inv.ref}.
              </p>
              <div>
                <p className="text-[0.95rem] font-[560] text-white/85">
                  {inv.payee?.name ?? inv.issuerName ?? 'Quien cobra'}
                  {inv.invoiceNumber ? `, factura ${inv.invoiceNumber}` : ''}
                </p>
                <p className="t-figure mt-1 text-[2.6rem] leading-none">
                  {inv.amountMinor !== null && inv.currency
                    ? formatMoney(inv.amountMinor, inv.currency)
                    : 'Sin monto'}
                </p>
                {inv.currency !== 'USD' && inv.usdCents !== null && (
                  <p className="mt-1.5 text-[0.95rem] text-white/80">≈ {formatUsd(inv.usdCents)}</p>
                )}
              </div>
            </div>
            {inv.summary && (
              <>
                <div className="pass-notch" aria-hidden />
                <p className="relative z-10 px-6 pt-5 pb-6 text-[1.05rem] leading-relaxed font-[480]">
                  {inv.summary}
                </p>
              </>
            )}
          </article>
          {others.length > 0 && (
            <div className="sheet grid gap-2 p-4">
              <p className="px-1 text-[0.84rem] font-[560] text-ink-2">Además</p>
              <ul className="grid gap-2">
                {others.map((f) => (
                  <li
                    key={f.title}
                    className="flex gap-2.5 rounded-[12px] bg-sheet-2 px-3 py-2.5 text-sm"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-pending" aria-hidden />
                    <div>
                      <p className="text-ink">{f.detail}</p>
                      <p className="mt-0.5 text-xs text-ink-3">Regla: {f.title}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inv.approval && inv.approval.required > 1 && (
            <p className="px-1 text-sm text-ink-2">
              Necesita {inv.approval.required} aprobaciones de personas distintas.{' '}
              {inv.approval.approvals
                .filter((a) => a.action === 'approve')
                .map((a) => `${a.name} ya aprobó.`)
                .join(' ')}
            </p>
          )}

          {phase === 'done' ? (
            <div className="sheet grid justify-items-center gap-3 p-6 text-center">
              {result === 'approve' ? (
                <CircleCheck className="size-10 text-paid" aria-hidden />
              ) : (
                <CircleSlash className="size-10 text-held" aria-hidden />
              )}
              <p className="t-h3 text-ink">
                {result === 'approve' ? 'Aprobación registrada' : 'Cobro rechazado'}
              </p>
              <p className="text-ink-2">
                Quedó en el registro encadenado con tu nombre. Ya puedes cerrar esta pestaña.
              </p>
            </div>
          ) : blocked ? (
            <div className="sheet flex gap-3 p-5 text-ink-2">
              <Clock className="size-5 shrink-0 text-ink-3" aria-hidden />
              {view.usedAt
                ? 'Este enlace ya se usó.'
                : view.expired
                  ? 'Este enlace venció.'
                  : 'Este cobro ya fue resuelto.'}
            </div>
          ) : (
            <div className="grid gap-3">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota (opcional)"
                aria-label="Nota"
              />
              <Button
                variant="approve"
                size="lg"
                onClick={() => act('approve')}
                loading={busy === 'approve'}
                disabled={busy !== null}
              >
                Aprobar el pago
              </Button>
              <Button
                variant="danger"
                size="lg"
                onClick={() => act('reject')}
                loading={busy === 'reject'}
                disabled={busy !== null}
              >
                Rechazar
              </Button>
              <p className="text-center text-xs text-ink-3">
                Enlace personal de un solo uso. Aprobar no cambia las reglas.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
