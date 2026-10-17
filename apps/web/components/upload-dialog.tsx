'use client';

import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { FileUp, MessageSquareText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { OUTCOME_COPY } from '@/lib/outcomes';
import type { Outcome } from '@/lib/types';
import { Button, Dialog, Textarea } from './ui';

interface IngestResponse {
  invoiceId: string;
  ref: string;
  created: boolean;
  outcome: Outcome;
  summary: string;
}

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.eml,.txt,application/pdf,image/*,message/rfc822,text/plain';

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const done = (result: IngestResponse) => {
    onOpenChange(false);
    setText('');
    toast(`${result.ref} · ${OUTCOME_COPY[result.outcome].short}`, {
      description: result.created
        ? result.summary
        : 'Este archivo ya estaba registrado: abrimos su decisión.',
    });
    router.push(`/facturas/${result.invoiceId}`);
  };

  const fail = (error: unknown) =>
    toast.error(
      error instanceof ApiError ? error.message : 'No pudimos subir el archivo. Intenta de nuevo.',
    );

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      done(await api<IngestResponse>('/api/v1/invoices', { method: 'POST', body: form }));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    setBusy(true);
    try {
      done(
        await api<IngestResponse>('/api/v1/invoices', {
          method: 'POST',
          body: JSON.stringify({ text, channel: 'chat' }),
        }),
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void upload(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Subir una factura"
      description="El agente la lee, revisa las 23 reglas y decide en segundos. Nada se paga de verdad: es una simulación."
    >
      <Tabs.Root defaultValue="file">
        <Tabs.List
          className="mb-4 inline-flex rounded-lg border border-rule bg-sheet-2 p-0.5"
          aria-label="Forma de envío"
        >
          <Tabs.Trigger
            value="file"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-2 data-[state=active]:bg-sheet data-[state=active]:text-ink data-[state=active]:shadow-sm"
          >
            <FileUp className="size-4" aria-hidden /> Archivo
          </Tabs.Trigger>
          <Tabs.Trigger
            value="text"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-2 data-[state=active]:bg-sheet data-[state=active]:text-ink data-[state=active]:shadow-sm"
          >
            <MessageSquareText className="size-4" aria-hidden /> Mensaje de chat
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="file">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            disabled={busy}
            className={clsx(
              'grid w-full place-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              dragging
                ? 'border-brand bg-brand-tint'
                : 'border-rule-strong hover:border-ink-3 hover:bg-sheet-2',
            )}
          >
            <FileUp className="size-8 text-brand" aria-hidden />
            <span className="text-[1.02rem] font-[600] text-ink">
              {busy ? 'Leyendo y decidiendo…' : 'Arrastra aquí la factura o haz clic para elegirla'}
            </span>
            <span className="text-sm text-ink-3">
              PDF, foto, correo (.eml) o texto. Máximo 10 MB.
            </span>
          </button>
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </Tabs.Content>

        <Tabs.Content value="text" className="grid gap-3">
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              'Pega el mensaje tal como llegó. Por ejemplo:\n«Hola, te paso mi cuenta de cobro N.º RM-003 por $9.000.000 COP, llave Bre-B @rafamendoza»'
            }
            aria-label="Mensaje recibido"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={sendText}
              loading={busy}
              disabled={text.trim().length < 5}
            >
              Enviar al agente
            </Button>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </Dialog>
  );
}
