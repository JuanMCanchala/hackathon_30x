'use client';

/**
 * What the «Maquetas» screens share: the API's limits, the brand from «Mi empresa», the blank
 * starting slides, a slide fitted into a box of any shape, the canvas glyph, «hace 3 h», and the
 * dialog that reuses a maqueta for another topic.
 */
import clsx from 'clsx';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { MonoLabel } from './kit';
import { FORMAT_SPEC } from './maqueta';
import { Dialog } from './ui';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type {
  Maqueta,
  MaquetaFormat,
  MaquetaInput,
  MaquetaOrigin,
  MaquetaSlide,
  MaquetaStyle,
  Radar,
  RadarTopic,
} from '@/lib/types';
import { useDecisions, type CompanyProfile } from '@/lib/workspace';

// ------------------------------------------------------------------ data

/**
 * A maqueta read straight from the API on every visit, never from the cache: the editor and a
 * reuse must start from the last saved version, not from what this browser saw before.
 */
export function useFreshMaqueta(id: string | null): { data?: Maqueta; error?: Error } | null {
  const [state, setState] = useState<{ id: string; data?: Maqueta; error?: Error } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<Maqueta>(`/api/v1/maquetas/${encodeURIComponent(id)}`).then(
      (data) => {
        if (alive) setState({ id, data });
      },
      (error: unknown) => {
        if (alive)
          setState({
            id,
            error: error instanceof Error ? error : new Error('No se pudo abrir la maqueta.'),
          });
      },
    );
    return () => {
      alive = false;
    };
  }, [id]);
  return id && state?.id === id ? state : null;
}

/** The cached list with this maqueta first, as the API orders it (most recently updated). */
export const listWith = (saved: Maqueta) => (list?: Maqueta[]) =>
  list ? [saved, ...list.filter((m) => m.id !== saved.id)] : list;

/** What the API accepts; the editor's fields stop at these lengths. */
export const LIMITS = {
  name: 80,
  kicker: 80,
  title: 200,
  body: 700,
  slides: 12,
  brand: 40,
  origin: 120,
} as const;

/** The team's brand as «Mi empresa» has it: the name, the first account and the round logo. */
export function brandFrom(profile: CompanyProfile): MaquetaStyle['brand'] {
  return {
    name: profile.name.trim().slice(0, LIMITS.brand) || '30X',
    handle: (profile.references[0]?.handle ?? '').trim().slice(0, LIMITS.brand),
    logo: true,
  };
}

/**
 * A maqueta as the API takes it: fixed key order (so two copies compare as text), the API's
 * lengths and lowercase colors.
 */
export function cleanInput(m: MaquetaInput): MaquetaInput {
  const s = m.style;
  const origin: MaquetaOrigin | null = !m.origin
    ? null
    : m.origin.kind === 'topic'
      ? {
          kind: 'topic',
          topicId: m.origin.topicId,
          adaptationId: m.origin.adaptationId,
          name: m.origin.name.slice(0, LIMITS.origin),
        }
      : {
          kind: 'vigia',
          watchId: m.origin.watchId,
          itemId: m.origin.itemId,
          name: m.origin.name.slice(0, LIMITS.origin),
        };
  return {
    name: m.name.trim().slice(0, LIMITS.name) || 'Maqueta',
    format: m.format,
    style: {
      preset: s.preset,
      bg: s.bg.toLowerCase(),
      ink: s.ink.toLowerCase(),
      accent: s.accent.toLowerCase(),
      soft: s.soft.toLowerCase(),
      font: s.font,
      headline: s.headline,
      align: s.align,
      texture: s.texture,
      brand: {
        name: s.brand.name.slice(0, LIMITS.brand),
        handle: s.brand.handle.slice(0, LIMITS.brand),
        logo: s.brand.logo,
      },
    },
    slides: m.slides.slice(0, LIMITS.slides).map((x) => ({
      layout: x.layout,
      kicker: x.kicker.slice(0, LIMITS.kicker),
      title: x.title.slice(0, LIMITS.title),
      body: x.body.slice(0, LIMITS.body),
    })),
    origin,
    basedOn: m.basedOn ?? null,
  };
}

/** Whether two maquetas say and look the same. */
export const sameMaqueta = (a: MaquetaInput, b: MaquetaInput) =>
  JSON.stringify(cleanInput(a)) === JSON.stringify(cleanInput(b));

const BLANK: MaquetaSlide[] = [
  {
    layout: 'portada',
    kicker: 'Tema de la semana',
    title: 'El titular que detiene el scroll',
    body: 'Una línea que diga por qué le importa a tu audiencia.',
  },
  {
    layout: 'titular',
    kicker: '01',
    title: 'Una idea por lámina',
    body: 'Explícala en dos o tres frases cortas, con la voz de tu equipo.',
  },
  {
    layout: 'cifra',
    kicker: '00 %',
    title: 'La cifra que lo prueba',
    body: 'Cambia el número y di de dónde sale.',
  },
  {
    layout: 'lista',
    kicker: 'Paso a paso',
    title: 'Lo que puedes hacer esta semana',
    body: 'Primer paso\nSegundo paso\nTercer paso',
  },
  { layout: 'cierre', kicker: '', title: 'Guárdalo y compártelo con tu equipo', body: '' },
];

/** The example text of a blank maqueta: five slides, or the cover alone on one-slide canvases. */
export function blankSlides(format: MaquetaFormat): MaquetaSlide[] {
  if (FORMAT_SPEC[format].multi) return BLANK.map((s) => ({ ...s }));
  return [{ ...BLANK[0]!, body: format === 'portada' ? '' : BLANK[0]!.body }];
}

/** «Tema: Shadow AI», «Vigía: negocios» or «En blanco». */
export function originLabel(origin: MaquetaOrigin | null): string {
  if (!origin) return 'En blanco';
  return origin.kind === 'topic' ? `Tema: ${origin.name}` : `Vigía: ${origin.name}`;
}

export function originHref(origin: MaquetaOrigin | null): string | null {
  if (!origin) return null;
  return origin.kind === 'topic' ? `/tema/${origin.topicId}` : `/vigia`;
}

export const slidesCount = (n: number) => `${n} ${n === 1 ? 'lámina' : 'láminas'}`;

// ------------------------------------------------------------------ time

/** «hace un momento», «hace 5 min», «hace 3 h», «ayer», «hace 4 días» or «12 oct». */
export function agoText(iso: string, now: number): string {
  const min = Math.max(0, (now - Date.parse(iso)) / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${Math.round(min)} min`;
  const hours = min / 60;
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  })
    .format(new Date(iso))
    .replace('.', '');
}

/** The current time, refreshed every `every` ms, so «hace 2 min» stays true. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/** Seconds since `on` turned true. */
export function useElapsed(on: boolean): number {
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

// ------------------------------------------------------------------ drawing

/**
 * A slide centered in a box whose width ÷ height is `box`: tall canvases fit by height, wide ones
 * by width, so a story and a YouTube cover sit side by side in the same grid.
 */
export function SlideFit({
  format,
  box,
  fill = 0.82,
  children,
  className,
}: {
  format: MaquetaFormat;
  box: number;
  fill?: number;
  children: ReactNode;
  className?: string;
}) {
  const { width, height } = FORMAT_SPEC[format];
  const pct = Math.min(1, width / height / box) * fill * 100;
  return (
    <div className={clsx('grid size-full place-items-center', className)}>
      <div style={{ width: `${pct.toFixed(2)}%` }}>{children}</div>
    </div>
  );
}

/** The canvas' shape as a small outlined rectangle: 4:5, 1:1, 9:16 or 16:9. */
export function FormatGlyph({
  format,
  size = 18,
  className,
}: {
  format: MaquetaFormat;
  size?: number;
  className?: string;
}) {
  const { width, height } = FORMAT_SPEC[format];
  const r = width / height;
  const inner = size - 2;
  const w = r >= 1 ? inner : Math.round(inner * r);
  const h = r >= 1 ? Math.round(inner / r) : inner;
  return (
    <span
      aria-hidden
      className={clsx('inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="rounded-[3px] border-[1.5px] border-current"
        style={{ width: w, height: h }}
      />
    </span>
  );
}

// ------------------------------------------------------------------ reuse

const reuseHref = (topicId: string, maquetaId: string) =>
  `/maquetas/nueva?tema=${encodeURIComponent(topicId)}&desde=${encodeURIComponent(maquetaId)}`;

/**
 * «Usar para otro post»: the week's topics, the ones marked «Sirve» in Elegir first. Picking one
 * opens /maquetas/nueva with this maqueta preselected; `onPick` runs instead when the caller has
 * to save first.
 */
export function ReuseDialog({
  open,
  onOpenChange,
  maqueta,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maqueta: Pick<Maqueta, 'id' | 'name' | 'origin'>;
  onPick?: (topicId: string) => Promise<void> | void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Usar para otro post"
      description={
        <>
          Elige el tema: OndAI arma un post nuevo con el diseño de «{maqueta.name}» y el texto de
          ese tema. Esta maqueta no cambia.
        </>
      }
    >
      {open && <ReuseList maqueta={maqueta} onPick={onPick} />}
    </Dialog>
  );
}

function ReuseList({
  maqueta,
  onPick,
}: {
  maqueta: Pick<Maqueta, 'id' | 'name' | 'origin'>;
  onPick?: (topicId: string) => Promise<void> | void;
}) {
  const router = useRouter();
  const { data: radar, error } = useApi<Radar>('/api/v1/radar');
  const [decisions] = useDecisions();
  const [busy, setBusy] = useState<string | null>(null);

  const topics = [...(radar?.topics ?? [])].sort(
    (a, b) => (b.fit ?? -1) - (a.fit ?? -1) || a.rank - b.rank,
  );
  const approved = topics.filter((t) => decisions[t.id] === 'sirve');
  const others = topics.filter((t) => decisions[t.id] !== 'sirve');
  const originId = maqueta.origin?.kind === 'topic' ? maqueta.origin.topicId : null;

  const pick = async (topicId: string) => {
    setBusy(topicId);
    try {
      if (onPick) await onPick(topicId);
      else router.push(reuseHref(topicId, maqueta.id));
    } finally {
      setBusy(null);
    }
  };

  const row = (t: RadarTopic) => (
    <li key={t.id}>
      <button
        type="button"
        onClick={() => void pick(t.id)}
        disabled={busy !== null}
        className="flex w-full items-center gap-3 rounded-[12px] border border-rule bg-sheet px-3.5 py-3 text-left transition hover:border-rule-strong hover:bg-sheet-2 disabled:cursor-wait disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.95rem] font-[700] text-ink">{t.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-ink-2">
            {t.fit !== null && <span>{t.fit}/10 encaje</span>}
            <span>{t.timing}</span>
            {t.id === originId && (
              <span className="rounded-[6px] bg-fill px-1.5 py-px text-[0.72rem] font-[650] text-ink">
                De aquí salió esta maqueta
              </span>
            )}
          </span>
        </span>
        {busy === t.id ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-ink-2" aria-hidden />
        ) : (
          <ArrowRight className="size-4 shrink-0 text-ink-3" aria-hidden />
        )}
      </button>
    </li>
  );

  if (error && !radar)
    return <p className="text-[0.92rem] text-ink-2">No pudimos leer los temas: {error.message}</p>;
  if (!radar)
    return (
      <div className="grid gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[62px] animate-pulse rounded-[12px] bg-fill" />
        ))}
      </div>
    );

  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <MonoLabel>Aprobados en Elegir · {approved.length}</MonoLabel>
        {approved.length ? (
          <ul className="grid gap-2">{approved.map(row)}</ul>
        ) : (
          <p className="rounded-[12px] border border-dashed border-rule-strong px-4 py-3 text-[0.88rem] text-ink-2">
            Todavía no marcas temas con ✓ en Elegir. Puedes usar cualquiera de la semana.
          </p>
        )}
      </section>
      {others.length > 0 && (
        <section className="grid gap-2">
          <MonoLabel>Otros temas de la semana</MonoLabel>
          <ul className="grid gap-2">{others.map(row)}</ul>
        </section>
      )}
      <p className="text-[0.8rem] text-ink-3">
        Si el tema todavía no tiene piezas, OndAI las escribe primero: tarda entre 30 y 60 segundos.
      </p>
    </div>
  );
}
