'use client';

import clsx from 'clsx';
import { Copy, Mail, MessageCircle, PenLine } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Textarea } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import type { InvoiceDetail } from '@/lib/types';

type Channel = 'whatsapp' | 'email';

/**
 * The reply to the vendor, drafted from the decision's own reasons. A person edits and sends it;
 * Mandato only opens WhatsApp or the mail client with the text ready.
 */
export function ReplyPanel({ invoice }: { invoice: InvoiceDetail }) {
  const [channel, setChannel] = useState<Channel>(invoice.source === 'chat' ? 'whatsapp' : 'email');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const email = invoice.extraction?.issuer.email ?? '';

  const draft = async () => {
    setBusy(true);
    try {
      const result = await post<{ subject: string; body: string }>(
        `/api/v1/invoices/${invoice.id}/reply-draft`,
        { channel },
      );
      setSubject(result.subject);
      setBody(result.body);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No pude redactar la respuesta.');
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    const url =
      channel === 'whatsapp'
        ? `https://wa.me/?text=${encodeURIComponent(body)}`
        : `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-h3 text-ink">Responder al proveedor</h2>
        <div
          role="radiogroup"
          aria-label="Canal"
          className="inline-flex rounded-full bg-fill p-0.5"
        >
          {(
            [
              ['whatsapp', 'WhatsApp', MessageCircle],
              ['email', 'Correo', Mail],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={channel === value}
              onClick={() => setChannel(value)}
              className={clsx(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.86rem] transition',
                channel === value ? 'bg-noche font-[600] text-white' : 'text-ink-2 hover:text-ink',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
      {!body ? (
        <div className="grid gap-3">
          <p className="text-[0.95rem] text-ink-2">
            El agente escribe la respuesta con los motivos de esta decisión y lo que el proveedor
            puede hacer, en su idioma. Tú la revisas y la envías.
          </p>
          <Button
            variant="secondary"
            icon={<PenLine className="size-4" aria-hidden />}
            onClick={draft}
            loading={busy}
            className="justify-self-start"
          >
            Redactar respuesta
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {channel === 'email' && (
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-label="Asunto"
              className="h-10 rounded-[10px] bg-fill px-3 text-[0.95rem] font-[600] text-ink outline-none focus:ring-4 focus:ring-brand/15"
            />
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            aria-label="Mensaje"
            className="leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={open}
              icon={
                channel === 'whatsapp' ? (
                  <MessageCircle className="size-4" aria-hidden />
                ) : (
                  <Mail className="size-4" aria-hidden />
                )
              }
            >
              {channel === 'whatsapp' ? 'Abrir en WhatsApp' : 'Abrir en el correo'}
            </Button>
            <Button
              variant="secondary"
              icon={<Copy className="size-4" aria-hidden />}
              onClick={() => {
                void navigator.clipboard.writeText(
                  channel === 'email' ? `${subject}\n\n${body}` : body,
                );
                toast('Respuesta copiada');
              }}
            >
              Copiar
            </Button>
            <Button variant="ghost" onClick={draft} loading={busy}>
              Redactar otra
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
