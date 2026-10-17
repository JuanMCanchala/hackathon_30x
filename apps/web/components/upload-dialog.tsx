'use client';

import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { CircleCheck, FileUp, Loader2, MessageSquareText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type DragEvent } from 'react';
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

const MAX_BYTES = 10 * 1024 * 1024;
const STEPS = ['Recibido', 'Leyendo el documento', 'Revisando las 23 reglas', 'Decisión tomada'];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What the agent is doing while the request is open. Reading is the slow step; the rules are
 * code and finish at once, so they check off when the answer arrives.
 */
function Progress({ step }: { step: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" className="grid gap-4 rounded-xl bg-sheet-2 px-5 py-6">
      <ol className="grid gap-2.5">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 text-[0.98rem]">
            {i < step ? (
              <CircleCheck className="size-5 text-paid" aria-hidden />
            ) : i === step ? (
              <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
            ) : (
              <span
                className="size-5 rounded-full border-2 border-dashed border-rule-strong"
                aria-hidden
              />
            )}
            <span className={i <= step ? 'text-ink' : 'text-ink-3'}>{label}</span>
          </li>
        ))}
      </ol>
      {step === 1 && elapsed >= 3 && (
        <p className="text-sm text-ink-3">
          {elapsed} s. Un documento nuevo tarda entre 5 y 30 segundos en leerse; uno que el agente
          ya leyó sale al instante.
        </p>
      )}
    </div>
  );
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
  const [step, setStep] = useState(1);
  const [text, setText] = useState('');

  const done = async (result: IngestResponse) => {
    setStep(2);
    await pause(250);
    setStep(3);
    await pause(350);
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
    if (file.size > MAX_BYTES) {
      toast.error(
        `${file.name} pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 10 MB.`,
      );
      return;
    }
    setStep(1);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await done(await api<IngestResponse>('/api/v1/invoices', { method: 'POST', body: form }));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const sendText = async () => {
    setStep(1);
    setBusy(true);
    try {
      await done(
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
          className="mb-4 inline-flex rounded-[9px] bg-fill p-0.5"
          aria-label="Forma de envío"
        >
          <Tabs.Trigger
            value="file"
            className="flex items-center gap-2 rounded-[7px] px-3 py-1 text-[0.86rem] text-ink-2 data-[state=active]:bg-sheet data-[state=active]:font-[590] data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
          >
            <FileUp className="size-4" aria-hidden /> Archivo
          </Tabs.Trigger>
          <Tabs.Trigger
            value="text"
            className="flex items-center gap-2 rounded-[7px] px-3 py-1 text-[0.86rem] text-ink-2 data-[state=active]:bg-sheet data-[state=active]:font-[590] data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
          >
            <MessageSquareText className="size-4" aria-hidden /> Mensaje de chat
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="file">
          {busy ? (
            <Progress step={step} />
          ) : (
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
                Arrastra aquí la factura o haz clic para elegirla
              </span>
              <span className="text-sm text-ink-3">
                PDF, foto, correo (.eml) o texto. Máximo 10 MB.
              </span>
            </button>
          )}
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
          {busy && <Progress step={step} />}
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
