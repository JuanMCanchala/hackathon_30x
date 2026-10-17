'use client';

import { CircleCheck, CircleSlash, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { ApiError, post } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { InvoiceDetail } from '@/lib/types';
import { Button, Dialog, Textarea, fmtDateTime } from '../ui';

function LinkDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceDetail;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const approvers = invoice.approval?.approvers ?? [];
  const [approver, setApprover] = useState(approvers[0]?.id ?? '');
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      setLink(
        await post<{ url: string; expiresAt: string }>(
          `/api/v1/invoices/${invoice.id}/approval-links`,
          { userId: approver },
        ),
      );
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No pudimos crear el enlace.');
    } finally {
      setBusy(false);
    }
  };

  const url = link
    ? link.url.replace(
        /^https?:\/\/[^/]+/,
        typeof window === 'undefined' ? '' : window.location.origin,
      )
    : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setLink(null);
      }}
      title="Aprobar desde el celular"
      description="Un enlace firmado que sirve una sola vez, solo para esa persona, y vence en 24 horas. Se puede mandar por WhatsApp, correo o Slack."
    >
      {!link ? (
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-[600] text-ink">¿Quién aprueba?</legend>
            {approvers.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-transparent bg-sheet-2 px-3 py-2.5 has-[:checked]:border-brand has-[:checked]:bg-brand-tint/50"
              >
                <input
                  type="radio"
                  name="approver"
                  value={a.id}
                  checked={approver === a.id}
                  onChange={() => setApprover(a.id)}
                  className="accent-[var(--brand)]"
                />
                <span className="text-[0.95rem] text-ink">{a.name}</span>
                <span className="text-sm text-ink-3">{a.title}</span>
              </label>
            ))}
          </fieldset>
          <Button variant="primary" onClick={create} loading={busy} disabled={!approver}>
            Crear enlace
          </Button>
        </div>
      ) : (
        <div className="grid justify-items-center gap-4 text-center">
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={url} size={208} level="M" />
          </div>
          <p className="text-sm text-ink-2">
            Escanéalo con la cámara del celular. Vence el {fmtDateTime(link.expiresAt)}.
          </p>
          <div className="flex w-full gap-2">
            <input
              readOnly
              value={url}
              className="h-10 min-w-0 flex-1 rounded-[14px] bg-sheet-2 px-3 text-xs text-ink-2"
              aria-label="Enlace de aprobación"
            />
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(url);
                toast('Enlace copiado');
              }}
            >
              Copiar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function ApprovalPanel({ invoice }: { invoice: InvoiceDetail }) {
  const { session, switchUser } = useSession();
  const { mutate } = useSWRConfig();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const approval = invoice.approval;
  if (!approval) return null;

  const me = session?.user;
  const alreadySigned = approval.approvals.some((a) => a.userId === me?.id);
  const approvedCount = approval.approvals.filter((a) => a.action === 'approve').length;
  // In the demo, the people who can still sign are one click away.
  const canStillSign = session?.demoMode
    ? approval.approvers.filter(
        (a) => a.id !== me?.id && !approval.approvals.some((x) => x.userId === a.id),
      )
    : [];

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action);
    try {
      await post(`/api/v1/invoices/${invoice.id}/${action}`, { note: note || null });
      toast(action === 'approve' ? 'Aprobación registrada' : 'Factura rechazada');
      setNote('');
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo registrar la decisión.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-h3 text-ink">Aprobación humana</h2>
        <p className="text-sm text-ink-2">
          {approval.required === 2
            ? 'Monto alto: se necesitan dos personas distintas'
            : 'Se necesita una persona'}
        </p>
      </div>

      <ol className="grid gap-2">
        {Array.from({ length: approval.required }).map((_, i) => {
          const entry = approval.approvals.filter((a) => a.action === 'approve')[i];
          return (
            <li key={i} className="flex items-center gap-3 rounded-[12px] bg-sheet-2 px-3.5 py-2.5">
              {entry ? (
                <CircleCheck className="size-5 text-paid" aria-hidden />
              ) : (
                <span
                  className="size-5 rounded-full border-2 border-dashed border-rule-strong"
                  aria-hidden
                />
              )}
              <span className="text-[0.95rem] text-ink">
                {entry ? `${entry.name} aprobó` : `Firma ${i + 1} de ${approval.required}`}
              </span>
              {entry && (
                <span className="ml-auto text-sm text-ink-3">
                  {entry.via === 'link' ? 'desde el celular, ' : ''}
                  {fmtDateTime(entry.at)}
                </span>
              )}
            </li>
          );
        })}
        {approval.approvals
          .filter((a) => a.action === 'reject')
          .map((a) => (
            <li
              key={a.userId}
              className="flex items-center gap-3 rounded-lg border border-held/30 bg-held-tint/50 px-3.5 py-2.5"
            >
              <CircleSlash className="size-5 text-held" aria-hidden />
              <span className="text-[0.95rem] text-ink">{a.name} rechazó</span>
              <span className="ml-auto text-sm text-ink-3">{fmtDateTime(a.at)}</span>
            </li>
          ))}
      </ol>
      {approval.approvals
        .filter((a) => a.note)
        .map((a) => (
          <blockquote
            key={`${a.userId}-note`}
            className="voice border-l-2 border-rule-strong pl-4 text-ink-2"
          >
            «{a.note}» <span className="font-sans text-sm text-ink-3">{a.name}</span>
          </blockquote>
        ))}

      {approval.status === 'pending' && (
        <div className="grid gap-3 rounded-xl border border-rule bg-sheet-2 p-4">
          {me?.canApprove && !alreadySigned ? (
            <>
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota para el registro (opcional): por qué apruebas o rechazas"
                aria-label="Nota"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="approve"
                  onClick={() => act('approve')}
                  loading={busy === 'approve'}
                  disabled={busy !== null}
                >
                  Aprobar el pago
                </Button>
                <Button
                  variant="danger"
                  onClick={() => act('reject')}
                  loading={busy === 'reject'}
                  disabled={busy !== null}
                >
                  Rechazar
                </Button>
              </div>
              <p className="text-xs text-ink-3">
                {approvedCount > 0
                  ? `Ya hay ${approvedCount} de ${approval.required} aprobaciones.`
                  : ''}{' '}
                Aprobar no cambia las reglas: si el cobro se repite, el agente te propondrá un
                acuerdo para firmar.
              </p>
            </>
          ) : (
            <div className="grid gap-3">
              <p className="text-[0.95rem] text-ink-2">
                {alreadySigned
                  ? 'Ya registraste tu aprobación: falta otra persona.'
                  : `${me?.name ?? 'Este usuario'} sube y revisa facturas, pero no aprueba pagos.`}
                {canStillSign.length > 0 && ' En la demo puedes seguir como:'}
              </p>
              {canStillSign.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {canStillSign.map((a) => (
                    <Button
                      key={a.id}
                      variant="secondary"
                      onClick={() => {
                        switchUser(a.id);
                        toast(`Ahora actúas como ${a.name}`, { description: a.title });
                      }}
                    >
                      {a.name.split(' ')[0]}, {a.title}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={<Smartphone className="size-4" aria-hidden />}
            onClick={() => setLinkOpen(true)}
            className="justify-self-start"
          >
            Enviar enlace de aprobación al celular
            <QrCode className="size-4" aria-hidden />
          </Button>
        </div>
      )}
      <LinkDialog invoice={invoice} open={linkOpen} onOpenChange={setLinkOpen} />
    </section>
  );
}
