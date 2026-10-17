'use client';

import clsx from 'clsx';
import { Info } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import useSWR from 'swr';
import { Logo } from '@/components/brand';
import { Button, FileField, Mono } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, formatDay, formatDecimal } from '@/lib/format';
import type { Outcome, PortalView } from '@/lib/types';

/** What the vendor reads after replying: their side of the decision, never Altamar's notes. */
const AFTER_REPLY: Record<Outcome, string> = {
  PAY: 'Listo: la cuenta quedó aprobada y el pago está programado al destino que tienes registrado.',
  PAY_PART:
    'Aprobamos el pago de la parte que tiene soporte. Si falta algo más, te lo escribimos aquí mismo.',
  ASK_VENDOR: 'Gracias. Todavía falta algo para pagarla; arriba te contamos qué.',
  ESCALATE: 'Gracias. Una persona de finanzas de Altamar la revisa y te escribe.',
  HOLD: 'Esta cuenta ya había llegado antes, así que no la registramos de nuevo.',
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule bg-sheet">
        <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between gap-4 px-4">
          <Logo />
          <span className="text-right text-[0.8125rem] text-ink-3">
            Portal de proveedores<span className="max-sm:hidden"> · Altamar Labs</span>
          </span>
        </div>
      </header>
      <main className="mx-auto grid max-w-[720px] gap-8 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const key = `/portal/${encodeURIComponent(token)}`;
  const { data, error, mutate } = useSWR<PortalView, ApiError>(key, (p: string) =>
    api.get<PortalView>(p),
  );
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [sent, setSent] = useState<Outcome | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() && !file) return setSendError('Escribe un mensaje o adjunta la cuenta.');
    setBusy(true);
    setSendError(null);
    try {
      const body = new FormData();
      body.append('message', message);
      if (file) body.append('file', file);
      const res = await api.post<{ outcome: Outcome }>(`${key}/reply`, body);
      setSent(res.outcome);
      setMessage('');
      setFile(null);
      void mutate();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setClosed(true);
      else setSendError(err instanceof Error ? err.message : 'No pudimos enviar tu respuesta.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data)
    return (
      <Shell>
        <div className="sheet grid gap-2 p-6">
          <h1 className="t-h3">
            {error.status === 404 ? 'Este enlace no es válido' : 'No pudimos abrir tu caso'}
          </h1>
          <p className="text-ink-2">
            {error.status === 404
              ? 'Puede que el caso ya no exista. Escríbele a finanzas de Altamar si necesitas ayuda.'
              : error.message}
          </p>
        </div>
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <div className="sheet h-80" aria-busy aria-label="Cargando tu caso" />
      </Shell>
    );

  const ask = data.messages.findLast((m) => m.sender === 'agent');
  const canReply = data.canReply && !closed;

  return (
    <Shell>
      <header className="grid gap-2">
        <h1 className="t-h1">Hola, {data.vendor.contactName.split(' ')[0]}</h1>
        <p className="text-ink-2">
          Sobre tu cuenta{' '}
          <Mono className="text-ink">{data.bill.invoiceNumber ?? 'sin número'}</Mono>
          {data.bill.issueDate && <> del {formatDay(data.bill.issueDate)}</>} por{' '}
          <Mono className="text-ink">{formatDecimal(data.bill.total, data.bill.currency)}</Mono>.
          Estado: <span className="font-[650] text-ink">{data.bill.statusLabel}</span>.
        </p>
      </header>

      {ask && (
        <section aria-labelledby="pedido" className="sheet grid gap-2 px-5 py-4">
          <h2 id="pedido" className="text-[0.875rem] font-[700] text-ink-3">
            Lo que te pide Altamar · <Mono>{formatDateTime(ask.at)}</Mono>
          </h2>
          <p className="text-[1.0625rem] leading-[1.5] whitespace-pre-wrap text-ink">{ask.body}</p>
        </section>
      )}

      {data.missing.length > 0 && (
        <section aria-labelledby="falta" className="grid gap-3">
          <h2 id="falta" className="t-h3">
            Lo que falta
            {data.askAmount && (
              <span className="font-[450] text-ink-2">
                {' '}
                · <Mono>{data.askAmount}</Mono> sin soporte
              </span>
            )}
          </h2>
          <ul className="sheet divide-y divide-rule">
            {data.missing.map((m) => (
              <li key={m.description} className="grid gap-1 px-5 py-3">
                <span className="font-[650]">{m.description}</span>
                <span className="t-mono text-[0.875rem] text-ink-2">
                  Facturado {m.billed} · con soporte {m.evidenced}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sent && (
        <p role="status" className="sheet border-pay/40 px-5 py-4 font-[600] text-pay">
          Recibimos tu respuesta. {AFTER_REPLY[sent]}
        </p>
      )}

      {canReply ? (
        <form onSubmit={(e) => void submit(e)} className="sheet grid gap-4 px-5 py-5">
          <h2 className="t-h3">Responder</h2>
          <label className="grid gap-1.5 text-[0.875rem] font-[650]">
            Tu mensaje
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Por ejemplo: te adjunto la cuenta corregida por las horas registradas."
              className="rounded-[6px] border border-rule-strong bg-sheet px-3 py-2 text-[1rem] font-[450] text-ink"
            />
          </label>
          <FileField
            label="Cuenta corregida (opcional): PDF, correo .eml o texto"
            file={file}
            onChange={setFile}
          />
          <p className="flex gap-2 rounded-[6px] bg-fill px-3 py-2.5 text-[0.875rem] text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Los datos de pago no se pueden cambiar por aquí; escríbele a finanzas de Altamar.
          </p>
          {sendError && (
            <p role="alert" className="text-[0.875rem] font-[650] text-escalate">
              {sendError}
            </p>
          )}
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar respuesta'}
            </Button>
          </div>
        </form>
      ) : (
        !sent && (
          <p className="sheet px-5 py-4 text-ink-2">
            Este caso ya no espera una respuesta tuya. Si algo no cuadra, escríbele a finanzas de
            Altamar.
          </p>
        )
      )}

      {data.messages.length > 1 && (
        <section aria-labelledby="hilo" className="grid gap-3">
          <h2 id="hilo" className="t-h3">
            Conversación
          </h2>
          <ol className="grid gap-3">
            {data.messages.map((m, i) => (
              <li
                key={`${m.at}-${i}`}
                className={clsx(
                  'max-w-[56ch] rounded-[10px] px-4 py-3',
                  m.sender === 'vendor' ? 'ml-auto bg-fill' : 'border border-rule bg-sheet',
                )}
              >
                <p className="flex flex-wrap justify-between gap-x-4 text-[0.8125rem]">
                  <span className="font-[700]">
                    {m.sender === 'vendor' ? 'Tú' : 'Recibido, de finanzas de Altamar'}
                  </span>
                  <Mono className="text-ink-3">{formatDateTime(m.at)}</Mono>
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Shell>
  );
}
