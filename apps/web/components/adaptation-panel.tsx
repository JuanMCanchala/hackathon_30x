'use client';

import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { CalendarPlus, Check, Copy, PenLine, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { Button } from './ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Adaptation, CalendarEntry } from '@/lib/types';

const FORMATS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'carousel', label: 'Carrusel de IG' },
  { value: 'reel', label: 'Reel o TikTok' },
  { value: 'youtube', label: 'YouTube' },
] as const;
type Format = (typeof FORMATS)[number]['value'];

/** The next weekday from tomorrow, as YYYY-MM-DD in Bogotá. */
function nextWeekday(): string {
  const d = new Date(Date.now() + 86_400_000);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function textOf(a: Adaptation, format: Format): string {
  if (format === 'carousel')
    return a.carousel.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n');
  if (format === 'reel')
    return [
      `Gancho (0–3 s): ${a.reel.hook}`,
      ...a.reel.beats.map((b, i) => `${i + 1}. ${b}\n   En pantalla: ${a.reel.onScreen[i] ?? ''}`),
      `Cierre: ${a.reel.cta}`,
    ].join('\n');
  if (format === 'youtube') return `${a.youtube.title}\n\nMiniatura: ${a.youtube.thumbnail}`;
  return a.linkedin;
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      icon={
        done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />
      }
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

function ApproveRow({ adaptation, format }: { adaptation: Adaptation; format: Format }) {
  const { mutate } = useSWRConfig();
  const [date, setDate] = useState(nextWeekday);
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const entry = await post<CalendarEntry>('/api/v1/calendar', {
        adaptationId: adaptation.id,
        format,
        scheduledFor: date,
      });
      toast('Quedó en el calendario', {
        description: `${entry.format}, ${new Date(`${entry.scheduledFor}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
        action: { label: 'Ver', onClick: () => (window.location.href = '/calendario') },
      });
      void mutate('/api/v1/calendar');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo aprobar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-rule pt-4">
      <label className="text-[0.88rem] text-ink-2" htmlFor={`date-${format}`}>
        Publicar el
      </label>
      <input
        id={`date-${format}`}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-9 rounded-full bg-fill px-3 text-[0.88rem] text-ink"
      />
      <Button
        variant="primary"
        size="sm"
        loading={busy}
        onClick={approve}
        icon={<CalendarPlus className="size-4" aria-hidden />}
      >
        Aprobar para el calendario
      </Button>
      <Link href="/calendario" className="text-[0.86rem] font-[600] text-brand hover:underline">
        Ver calendario
      </Link>
    </div>
  );
}

function FormatBody({ a, format }: { a: Adaptation; format: Format }) {
  if (format === 'carousel')
    return (
      <ol className="grid gap-2.5 sm:grid-cols-2">
        {a.carousel.map((s, i) => (
          <li key={i} className="rounded-[14px] bg-sheet-2 p-3.5">
            <p className="text-[0.76rem] font-[700] text-ink-3">Lámina {i + 1}</p>
            <p className="mt-0.5 font-[720] text-ink">{s.title}</p>
            <p className="mt-1 text-[0.92rem] text-ink-2">{s.body}</p>
          </li>
        ))}
      </ol>
    );
  if (format === 'reel')
    return (
      <div className="grid gap-3">
        <p className="rounded-[14px] bg-marker/15 px-4 py-3 text-ink">
          <span className="font-[720]">Primeros 3 segundos: </span>
          {a.reel.hook}
        </p>
        <ol className="grid gap-2">
          {a.reel.beats.map((b, i) => (
            <li key={i} className="grid grid-cols-[1.6rem_1fr] gap-2">
              <span className="t-figure text-ink-3">{i + 1}</span>
              <div>
                <p className="text-ink">{b}</p>
                {a.reel.onScreen[i] && (
                  <p className="text-[0.86rem] text-ink-3">En pantalla: {a.reel.onScreen[i]}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="text-ink-2">
          <span className="font-[700] text-ink">Cierre: </span>
          {a.reel.cta}
        </p>
      </div>
    );
  if (format === 'youtube')
    return (
      <div className="grid gap-2">
        <p className="t-h3 text-ink">{a.youtube.title}</p>
        <p className="text-ink-2">
          <span className="font-[700] text-ink">Miniatura: </span>
          {a.youtube.thumbnail}
        </p>
      </div>
    );
  return (
    <p className="max-w-2xl text-[1rem] leading-relaxed whitespace-pre-line text-ink">
      {a.linkedin}
    </p>
  );
}

/** «Cómo lo contamos»: the topic in 30X's formats and voice, to copy or approve. */
export function AdaptationPanel({ topicId }: { topicId: string }) {
  const { data: list, mutate } = useApi<Adaptation[]>(`/api/v1/topics/${topicId}/adaptations`);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [format, setFormat] = useState<Format>('linkedin');
  const versions = [...(list ?? [])].sort((a, b) => a.variant - b.variant);
  const current = versions[Math.min(index, versions.length - 1)];

  const write = async (variant: number) => {
    setBusy(true);
    try {
      await post<Adaptation>(`/api/v1/topics/${topicId}/adaptations`, { variant });
      await mutate();
      setIndex(variant);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo escribir ahora.');
    } finally {
      setBusy(false);
    }
  };

  if (!list) return <div className="h-48 animate-pulse rounded-[22px] bg-sheet" />;
  if (!current)
    return (
      <div className="sheet grid justify-items-start gap-3 p-6">
        <p className="max-w-xl text-ink-2">
          El radar escribe el post de LinkedIn, el carrusel, el guion del Reel y el video de YouTube
          con la voz de 30X, a partir de los ganchos que funcionaron. Una persona revisa y aprueba;
          nada se publica solo.
        </p>
        <Button
          variant="primary"
          loading={busy}
          onClick={() => write(0)}
          icon={<PenLine className="size-4" aria-hidden />}
        >
          {busy ? 'Escribiendo, tarda unos segundos…' : 'Escribir las piezas'}
        </Button>
      </div>
    );

  return (
    <div className="sheet grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-[0.8rem] font-[700] text-ink-3">El ángulo de 30X</p>
          <p className="mt-1 text-[1.08rem] leading-snug font-[650] text-ink">{current.angle}</p>
        </div>
        <div className="flex items-center gap-2">
          {versions.length > 1 && (
            <div className="flex rounded-full bg-fill p-0.5" role="radiogroup" aria-label="Versión">
              {versions.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={i === index}
                  onClick={() => setIndex(i)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-[0.82rem] font-[650]',
                    i === index ? 'bg-sheet text-ink shadow-sheet' : 'text-ink-2',
                  )}
                >
                  Versión {i + 1}
                </button>
              ))}
            </div>
          )}
          <Button
            size="sm"
            loading={busy}
            onClick={() => write(versions.length)}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Otra versión
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-[0.8rem] font-[700] text-ink-3">Tres ganchos para abrir</p>
        <ul className="grid gap-2 md:grid-cols-3">
          {current.hooks.map((h) => (
            <li key={h} className="rounded-[14px] bg-sheet-2 px-3.5 py-2.5 text-[0.95rem] text-ink">
              {h}
            </li>
          ))}
        </ul>
      </div>

      <Tabs.Root
        value={format}
        onValueChange={(v) => setFormat(v as Format)}
        className="grid gap-4"
      >
        <Tabs.List
          className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1"
          aria-label="Formato"
        >
          {FORMATS.map((f) => (
            <Tabs.Trigger
              key={f.value}
              value={f.value}
              className="rounded-full px-3.5 py-1.5 text-[0.88rem] font-[650] whitespace-nowrap text-ink-2 data-[state=active]:bg-sheet data-[state=active]:text-ink data-[state=active]:shadow-sheet"
            >
              {f.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {FORMATS.map((f) => (
          <Tabs.Content key={f.value} value={f.value} className="grid gap-4 outline-none">
            <div className="flex justify-end">
              <CopyButton text={textOf(current, f.value)} />
            </div>
            <FormatBody a={current} format={f.value} />
            <ApproveRow adaptation={current} format={f.value} />
          </Tabs.Content>
        ))}
      </Tabs.Root>

      {current.avoid.length > 0 && (
        <div className="rounded-[14px] bg-st-saturado-tint px-4 py-3">
          <p className="text-[0.84rem] font-[700] text-ink">
            Qué evitar: ya está gastado o no le conviene a 30X
          </p>
          <ul className="mt-1 list-disc pl-5 text-[0.92rem] text-ink-2">
            {current.avoid.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
