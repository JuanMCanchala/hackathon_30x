'use client';

import clsx from 'clsx';
import {
  Check,
  Copy,
  Globe,
  Link2,
  MessageSquare,
  Palette,
  PenLine,
  Repeat2,
  RotateCw,
  Send,
  ShieldCheck,
  Star,
  ThumbsUp,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FORMATS, FormatBody, textOf, type Format } from '@/components/adaptation-panel';
import { MAQUETA_FOR_PIECE } from '@/components/calendario-format';
import { Card, DarkNote, MonoLabel, PageHead, Pill } from '@/components/kit';
import { ScheduleDialog } from '@/components/schedule-dialog';
import { Page } from '@/components/shell';
import { fmtRatio, pieceMetrics } from '@/components/tema-kit';
import { Button, Empty, Skeleton } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { todayIso } from '@/lib/dates';
import { useApi } from '@/lib/hooks';
import { LANG_SHORT, PLATFORM_COPY, type Adaptation, type TopicDetail } from '@/lib/types';

/** The API writes variants 0 to 5. */
const MAX_VARIANT = 5;

const TAB_LABEL: Record<Format, string> = {
  linkedin: 'LinkedIn',
  carousel: 'Carrusel IG',
  reel: 'Reel / TikTok',
  youtube: 'YouTube',
};

/** How the calendar names each format («Programar» shows it with the topic). */
const SCHEDULE_LABEL: Record<Format, string> = {
  linkedin: 'Post de LinkedIn',
  carousel: 'Carrusel de Instagram',
  reel: 'Reel o TikTok',
  youtube: 'Video de YouTube',
};

/** The day Calendario's «Agregar» asked for (`?dia=YYYY-MM-DD`), when it is still ahead. */
function askedDay(): string | undefined {
  const day = new URLSearchParams(window.location.search).get('dia');
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= todayIso() ? day : undefined;
}

/** Seconds since `on` turned true, for the «writing» copy. */
function useElapsed(on: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setS((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      setS(0);
    };
  }, [on]);
  return s;
}

/** «Copiar texto», outlined like the mockup. */
function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error('No se pudo copiar.');
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-rule-strong bg-sheet px-3 text-[0.86rem] font-[600] whitespace-nowrap text-ink transition hover:border-ink"
    >
      {done ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? 'Copiado' : 'Copiar texto'}
    </button>
  );
}

const BAR = [
  { icon: ThumbsUp, label: 'Recomendar' },
  { icon: MessageSquare, label: 'Comentar' },
  { icon: Repeat2, label: 'Compartir' },
  { icon: Send, label: 'Enviar' },
];

/** A LinkedIn-like post: 30X's header, the chosen hook in bold, the text, a cover and the bar. */
function LinkedInPreview({ hook, text }: { hook: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-rule bg-sheet">
      <div className="grid gap-4 p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-[0.82rem] font-[750] text-sheet">
            30X
          </span>
          <div className="min-w-0">
            <p className="text-[0.92rem] font-[700] text-ink">30X</p>
            <p className="flex items-center gap-1 text-[0.76rem] text-ink-3">
              Comunidad para CEOs de LatAm · Ahora ·
              <Globe className="size-3" aria-label="Público" />
            </p>
          </div>
        </div>
        <div className="text-[0.92rem] leading-relaxed text-ink">
          <p className="font-[700]">{hook}</p>
          <p className="mt-4 whitespace-pre-line">{text}</p>
        </div>
      </div>
      <div className="grid min-h-[220px] content-end bg-marker px-6 py-8 sm:min-h-[300px] sm:px-10 sm:py-12">
        <p
          className={clsx(
            'max-w-[24ch] leading-[1.1] font-[750] tracking-[-0.02em] text-on-marker',
            hook.length > 60 ? 'text-[1.35rem] sm:text-[1.8rem]' : 'text-[1.6rem] sm:text-[2.3rem]',
          )}
        >
          {hook}
        </p>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-b border-rule px-4 py-2 text-[0.74rem] text-ink-3">
        <span>Vista previa</span>
        <span>Se publica solo cuando lo apruebes</span>
      </div>
      <div className="grid grid-cols-4 px-2 py-2 text-[0.8rem] font-[650] text-ink-2" aria-hidden>
        {BAR.map(({ icon: I, label }) => (
          <span key={label} className="inline-flex items-center justify-center gap-1.5 py-1">
            <I className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** No adaptation yet: what the radar will write, and the button to write it. */
function WriteFirst({
  busy,
  onWrite,
  hasInspiration,
}: {
  busy: boolean;
  onWrite: () => void;
  hasInspiration: boolean;
}) {
  const s = useElapsed(busy);
  return (
    <Card icon={<PenLine />} tone="lavender" title="Todavía no hay piezas para este tema">
      <div className="grid justify-items-start gap-4">
        <p className="max-w-2xl text-[0.95rem] leading-relaxed text-ink-2">
          OndAI escribe el ángulo, tres ganchos, el post de LinkedIn, el carrusel, el guion del Reel
          y el video de YouTube con la voz de 30X, a partir de los patrones que funcionaron
          {hasInspiration ? ' y de lo que ya despegó en inglés y portugués' : ''}. Una persona
          revisa y aprueba; nada se publica solo.
        </p>
        <Button
          variant="primary"
          loading={busy}
          onClick={onWrite}
          icon={<PenLine className="size-4" aria-hidden />}
          className="rounded-[10px]!"
        >
          {busy ? 'Escribiendo las piezas…' : 'Escribir las piezas'}
        </Button>
        {busy && (
          <p className="text-[0.86rem] text-ink-2" role="status">
            Escribiendo con la voz de 30X. Tarda entre 30 y 60 segundos ({s} s).
          </p>
        )}
      </div>
    </Card>
  );
}

export default function ContarPage() {
  const { id } = useParams<{ id: string }>();
  const { data: detail } = useApi<TopicDetail>(`/api/v1/topics/${id}`);
  const { data: list, error, mutate } = useApi<Adaptation[]>(`/api/v1/topics/${id}/adaptations`);

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [hook, setHook] = useState(0);
  const [format, setFormat] = useState<Format>('linkedin');
  const [writing, setWriting] = useState(false);
  /** Open with the day to suggest, while the team picks the day and hour. */
  const [scheduling, setScheduling] = useState<{ day: string | undefined } | null>(null);
  const elapsed = useElapsed(writing);

  const versions = [...(list ?? [])].sort((a, b) => a.variant - b.variant);
  const current = versions.find((v) => v.id === pickedId) ?? versions.at(-1);
  const nextVariant = versions.length ? Math.max(...versions.map((v) => v.variant)) + 1 : 0;
  const name = detail?.topic.name ?? 'Tema';
  const inspiration = detail?.inspiration ?? [];

  const write = async (variant: number) => {
    setWriting(true);
    try {
      const a = await post<Adaptation>(`/api/v1/topics/${id}/adaptations`, { variant });
      await mutate();
      setPickedId(a.id);
      setHook(0);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo escribir ahora.');
    } finally {
      setWriting(false);
    }
  };

  const head = (
    <PageHead
      crumbs={[
        { label: 'Radar', href: '/radar' },
        { label: name, href: `/tema/${id}` },
        { label: 'Cómo lo contamos' },
      ]}
      title="Cómo lo contamos en la voz de 30X"
      actions={
        current && (
          <>
            <button
              type="button"
              onClick={() => write(nextVariant)}
              disabled={writing || nextVariant > MAX_VARIANT}
              title={nextVariant > MAX_VARIANT ? 'Ya hay seis variantes de este tema.' : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.9rem] font-[650] text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCw className={clsx('size-4', writing && 'animate-spin')} aria-hidden />
              {writing ? `Escribiendo… ${elapsed} s` : 'Otra variante'}
            </button>
            <Link
              href={`/maquetas/nueva?tema=${id}&formato=${MAQUETA_FOR_PIECE[format]}`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.9rem] font-[650] text-ink transition hover:border-ink"
            >
              <Palette className="size-4" aria-hidden />
              Armar maqueta
            </Link>
            <Button
              variant="primary"
              onClick={() => setScheduling({ day: askedDay() })}
              icon={<Check className="size-4" aria-hidden />}
              className="rounded-[10px]!"
            >
              Aprobar al calendario
            </Button>
            <ScheduleDialog
              open={scheduling !== null}
              onOpenChange={(open) => !open && setScheduling(null)}
              source={{
                adaptationId: current.id,
                format,
                // The calendar keeps the hook the team picked above.
                hook: format === 'linkedin' ? Math.min(hook, current.hooks.length - 1) : undefined,
              }}
              what={`${SCHEDULE_LABEL[format]} · ${name}`}
              defaultDate={scheduling?.day}
            />
          </>
        )
      }
    />
  );

  if (error)
    return (
      <Page className="grid gap-5">
        {head}
        <Empty
          title="No pudimos abrir las piezas"
          action={
            <Link href={`/tema/${id}`} className="font-[600] text-brand">
              Volver al tema
            </Link>
          }
        >
          {error instanceof Error ? error.message : null}
        </Empty>
      </Page>
    );

  if (!list)
    return (
      <Page className="grid gap-5">
        {head}
        <Skeleton className="h-52" />
        <Skeleton className="h-[480px]" />
      </Page>
    );

  if (!current)
    return (
      <Page className="grid gap-5">
        {head}
        <WriteFirst
          busy={writing}
          onWrite={() => write(0)}
          hasInspiration={inspiration.length > 0}
        />
        <DarkNote>
          <ShieldCheck className="size-5 shrink-0" aria-hidden />
          Nada se publica solo. Una persona aprueba cada pieza.
        </DarkNote>
      </Page>
    );

  const chosenHook = current.hooks[Math.min(hook, current.hooks.length - 1)] ?? '';
  const sources = (current.inspiredBy ?? [])
    .map((pid) => inspiration.find((p) => p.id === pid))
    .filter((p) => p !== undefined);
  const sourceLangs = [...new Set(sources.map((p) => LANG_SHORT[p.lang]))];
  const copy =
    format === 'linkedin' ? `${chosenHook}\n\n${current.linkedin}` : textOf(current, format);

  return (
    <Page className="grid gap-5">
      {head}

      <section className="flex flex-col gap-4 rounded-[14px] border border-rule bg-sheet p-5 sm:flex-row sm:gap-5">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-[12px] bg-lavender text-on-lavender"
          aria-hidden
        >
          <Star className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MonoLabel>Ángulo · variante {current.variant + 1}</MonoLabel>
            {versions.length > 1 && (
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Variante">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={v.id === current.id}
                    onClick={() => {
                      setPickedId(v.id);
                      setHook(0);
                    }}
                    className={clsx(
                      'h-7 min-w-7 rounded-[7px] border px-2 text-[0.78rem] font-[650] tabular-nums transition',
                      v.id === current.id
                        ? 'border-ink bg-ink text-sheet'
                        : 'border-rule text-ink-2 hover:border-rule-strong',
                    )}
                  >
                    {v.variant + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-[1.2rem] leading-snug font-[700] tracking-[-0.01em] text-ink">
            {current.angle}
          </p>
          <div className="grid gap-2">
            <p className="text-[0.86rem] font-[700] text-ink">Elige el gancho</p>
            <div className="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="Gancho">
              {current.hooks.map((h, i) => {
                const on = h === chosenHook;
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setHook(i)}
                    className={clsx(
                      'flex items-start gap-3 rounded-[10px] border px-4 py-3.5 text-left text-[0.9rem] leading-snug text-ink transition',
                      on
                        ? 'border-marker bg-marker/[0.06]'
                        : 'border-rule hover:border-rule-strong',
                    )}
                  >
                    <span
                      className={clsx(
                        'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border',
                        on ? 'border-marker bg-marker' : 'border-rule-strong',
                      )}
                      aria-hidden
                    />
                    {h}
                  </button>
                );
              })}
            </div>
          </div>
          {sources.length > 0 && (
            <p className="text-[0.84rem] text-ink-2">
              Basado en{' '}
              {sources.length === 1 ? 'una pieza original' : `${sources.length} piezas originales`}{' '}
              que {sources.length === 1 ? 'despegó' : 'despegaron'} en {sourceLangs.join(' y ')}
            </p>
          )}
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Formato">
        {FORMATS.map((f) => (
          <Pill
            key={f.value}
            role="tab"
            aria-selected={format === f.value}
            on={format === f.value}
            onClick={() => setFormat(f.value)}
          >
            {TAB_LABEL[f.value]}
          </Pill>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card
          title={`Vista previa · ${TAB_LABEL[format]}`}
          action={<CopyText text={copy} />}
          className="min-w-0"
        >
          {format === 'linkedin' ? (
            <LinkedInPreview hook={chosenHook} text={current.linkedin} />
          ) : (
            <div className="rounded-[12px] border border-rule p-4">
              <FormatBody a={current} format={format} />
            </div>
          )}
        </Card>

        <div className="grid gap-4">
          {current.avoid.length > 0 && (
            <Card icon={<TriangleAlert />} tone="amber" title="Qué evitar">
              <ul className="grid list-disc gap-1.5 pl-5 text-[0.92rem] leading-snug text-ink">
                {current.avoid.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Card>
          )}
          {sources.length > 0 && (
            <Card icon={<Link2 />} tone="lavender" title="Inspirado en">
              <ul className="grid gap-2.5 text-[0.9rem]">
                {sources.map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      title={(p.hook || p.title || p.text).slice(0, 160)}
                      className="text-ink-2 hover:text-brand"
                    >
                      <span className="font-[700] text-ink">
                        {LANG_SHORT[p.lang]} · {PLATFORM_COPY[p.platform]}
                      </span>
                      {[
                        pieceMetrics(p),
                        p.outlier !== null ? `${fmtRatio(p.outlier)} su mediana` : '',
                      ]
                        .filter(Boolean)
                        .map((s) => ` · ${s}`)
                        .join('')}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <DarkNote>
            <ShieldCheck className="size-5 shrink-0" aria-hidden />
            Nada se publica solo. Una persona aprueba cada pieza.
          </DarkNote>
        </div>
      </div>
    </Page>
  );
}
