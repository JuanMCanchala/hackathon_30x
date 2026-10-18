'use client';

/**
 * A new maqueta. From a topic (?tema=) it takes the topic's latest adaptation, from a piece Vigía
 * caught (?vigia=&pieza=) that piece's adaptation, writing it first when there is none. Then one
 * decision: the canvas and the look, every option drawn with the new text. Without a source it
 * starts blank, with example text.
 */
import clsx from 'clsx';
import { Check, LayoutTemplate, PenLine, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { DarkNote, MonoLabel, PageHead, type Crumb } from '@/components/kit';
import {
  FORMAT_SPEC,
  FORMATS_ORDER,
  MaquetaSlideView,
  PRESETS,
  maquetaName,
  slidesFromAdaptation,
  slidesInMaqueta,
  styleFrom,
} from '@/components/maqueta';
import {
  FormatGlyph,
  blankSlides,
  brandFrom,
  cleanInput,
  listWith,
  slidesCount,
  useElapsed,
  useFreshMaqueta,
} from '@/components/maqueta-kit';
import { Page } from '@/components/shell';
import { Button, Empty, Skeleton } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type {
  Adaptation,
  AdaptationContent,
  Maqueta,
  MaquetaFormat,
  MaquetaOrigin,
  MaquetaSlide,
  MaquetaStyle,
  TopicDetail,
  WatchDetail,
} from '@/lib/types';
import { useProfile } from '@/lib/workspace';

const CRUMBS: Crumb[] = [
  { label: 'Planear', href: '/calendario' },
  { label: 'Maquetas', href: '/maquetas' },
  { label: 'Nueva' },
];

/** How long to wait for the draft Elegir asked for before writing one from here. */
const WAIT_FOR_DRAFT_S = 75;

/** «Portada de YouTube» → «portada de YouTube». */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const asFormat = (v: string | null): MaquetaFormat | null =>
  v && (FORMATS_ORDER as string[]).includes(v) ? (v as MaquetaFormat) : null;

export default function NuevaMaquetaPage() {
  return (
    <Suspense fallback={<Preparing />}>
      <Nueva />
    </Suspense>
  );
}

function Nueva() {
  const params = useSearchParams();
  const tema = params.get('tema');
  const vigia = params.get('vigia');
  const pieza = params.get('pieza');
  const format = asFormat(params.get('formato'));
  const desde = params.get('desde');
  if (tema)
    return (
      <FromTopic
        key={tema}
        topicId={tema}
        format={format}
        desde={desde}
        waitDraft={params.get('escribiendo') === '1'}
      />
    );
  if (vigia && pieza)
    return (
      <FromVigia
        key={`${vigia}:${pieza}`}
        watchId={vigia}
        itemId={pieza}
        format={format}
        desde={desde}
      />
    );
  return <Composer content={null} origin={null} topicName="" initialFormat={format} desde={null} />;
}

// ------------------------------------------------------------------ loading the text

function Preparing() {
  return (
    <Page className="grid gap-6">
      <PageHead crumbs={CRUMBS} title="¿Con qué maqueta lo armamos?" lead="Preparando el texto…" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-4">
          <Skeleton className="h-[72px]" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-[4/5]" />
            ))}
          </div>
        </div>
        <Skeleton className="h-[560px]" />
      </div>
    </Page>
  );
}

function Writing({ seconds, name }: { seconds: number; name: string }) {
  return (
    <Page className="grid gap-6">
      <PageHead crumbs={CRUMBS} title="¿Con qué maqueta lo armamos?" />
      <section className="grid justify-items-center gap-5 rounded-[14px] border border-rule bg-sheet px-6 py-14 text-center">
        <span className="grid size-14 place-items-center rounded-[14px] bg-lavender-tint text-brand-strong">
          <PenLine className="size-6" aria-hidden />
        </span>
        <div className="grid gap-1.5">
          <p className="text-[1.2rem] font-[700] text-ink">
            <span role="status">Escribiendo las piezas con la voz de 30X…</span>{' '}
            <span className="text-ink-2 tabular-nums" aria-hidden>
              {seconds} s
            </span>
          </p>
          <p className="mx-auto max-w-md text-[0.92rem] text-ink-2">
            {name ? `«${name}» todavía no tenía piezas.` : 'La pieza todavía no tenía texto.'} Tarda
            entre 30 y 60 segundos; después eliges cómo se ve.
          </p>
        </div>
        <span
          className="relative h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-fill"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-marker transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(92, (seconds / 60) * 100)}%` }}
          />
        </span>
      </section>
    </Page>
  );
}

function Problem({
  title,
  message,
  links,
}: {
  title: string;
  message: string;
  links: { href: string; label: string }[];
}) {
  return (
    <Page className="grid gap-6">
      <PageHead crumbs={CRUMBS} title="¿Con qué maqueta lo armamos?" />
      <Empty
        title={title}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="font-[650] text-brand hover:underline">
                {l.label}
              </Link>
            ))}
          </div>
        }
      >
        {message}
      </Empty>
    </Page>
  );
}

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function FromTopic({
  topicId,
  format,
  desde,
  waitDraft,
}: {
  topicId: string;
  format: MaquetaFormat | null;
  desde: string | null;
  /** Elegir asked for the draft a moment ago: wait for it before writing another. */
  waitDraft: boolean;
}) {
  const { data: detail, error: detailError } = useApi<TopicDetail>(`/api/v1/topics/${topicId}`);
  const {
    data: list,
    error: listError,
    mutate,
  } = useApi<Adaptation[]>(`/api/v1/topics/${topicId}/adaptations`, {
    refreshInterval: (latest) => (waitDraft && latest && latest.length === 0 ? 3000 : 0),
  });
  const [writeError, setWriteError] = useState<string | null>(null);
  const started = useRef(false);
  const empty = list !== undefined && list.length === 0;
  const seconds = useElapsed(empty && !writeError);
  const shouldWrite = empty && !writeError && (!waitDraft || seconds >= WAIT_FOR_DRAFT_S);

  useEffect(() => {
    if (!shouldWrite || started.current) return;
    started.current = true;
    post<Adaptation>(`/api/v1/topics/${topicId}/adaptations`, { variant: 0 })
      .then(() => mutate())
      .catch((e: unknown) => setWriteError(messageOf(e, 'No se pudo escribir ahora.')));
  }, [shouldWrite, topicId, mutate]);

  const latest = useMemo(
    () => [...(list ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [list],
  );

  if (detailError && !detail)
    return (
      <Problem
        title="No encontramos ese tema"
        message={messageOf(detailError, 'El tema no está en el radar de esta semana.')}
        links={[
          { href: '/elegir', label: 'Volver a Elegir' },
          { href: '/maquetas', label: 'Ver las maquetas' },
        ]}
      />
    );
  if (writeError || (listError && !list))
    return (
      <Problem
        title="No pudimos preparar el texto"
        message={writeError ?? messageOf(listError, 'No pudimos leer las piezas del tema.')}
        links={[
          { href: `/tema/${topicId}/contar`, label: 'Ver el borrador del tema' },
          { href: '/elegir', label: 'Volver a Elegir' },
        ]}
      />
    );
  if (!detail || !list) return <Preparing />;
  if (!latest) return <Writing seconds={seconds} name={detail.topic.name} />;

  const name = detail.topic.name;
  return (
    <Composer
      content={latest}
      origin={{ kind: 'topic', topicId, adaptationId: latest.id, name }}
      topicName={name}
      initialFormat={format}
      desde={desde}
      back={{ href: `/tema/${topicId}/contar`, label: 'Ver borrador' }}
    />
  );
}

function FromVigia({
  watchId,
  itemId,
  format,
  desde,
}: {
  watchId: string;
  itemId: string;
  format: MaquetaFormat | null;
  desde: string | null;
}) {
  const { data: watch, error, mutate } = useApi<WatchDetail>(`/api/v1/watches/${watchId}`);
  const hit = watch?.hits.find((h) => h.piece.id === itemId) ?? null;
  const [written, setWritten] = useState<AdaptationContent | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const started = useRef(false);
  const content = hit?.adaptation ?? written;
  const needsWrite = !!hit && !content && !writeError;
  const seconds = useElapsed(needsWrite);

  useEffect(() => {
    if (!needsWrite || started.current) return;
    started.current = true;
    post<AdaptationContent>(`/api/v1/watches/${watchId}/hits/${encodeURIComponent(itemId)}/adapt`, {
      variant: 0,
    })
      .then((a) => {
        setWritten(a);
        void mutate();
      })
      .catch((e: unknown) => setWriteError(messageOf(e, 'No se pudo escribir ahora.')));
  }, [needsWrite, watchId, itemId, mutate]);

  if (error && !watch)
    return (
      <Problem
        title="No encontramos esa búsqueda de Vigía"
        message={messageOf(error, 'Puede que la hayan borrado.')}
        links={[{ href: '/vigia', label: 'Volver a Vigía' }]}
      />
    );
  if (!watch) return <Preparing />;
  if (!hit)
    return (
      <Problem
        title="No encontramos esa pieza"
        message="Ya no está entre lo que Vigía atrapó para este tema."
        links={[{ href: '/vigia', label: 'Volver a Vigía' }]}
      />
    );
  if (writeError)
    return (
      <Problem
        title="No pudimos preparar el texto"
        message={writeError}
        links={[{ href: '/vigia', label: 'Volver a Vigía' }]}
      />
    );
  if (!content) return <Writing seconds={seconds} name="" />;

  const term = watch.watch.term;
  return (
    <Composer
      content={content}
      origin={{ kind: 'vigia', watchId, itemId, name: term }}
      topicName={term.charAt(0).toUpperCase() + term.slice(1)}
      initialFormat={format}
      desde={desde}
      back={{ href: '/vigia', label: 'Volver a Vigía' }}
    />
  );
}

// ------------------------------------------------------------------ the decision

interface Option {
  key: string;
  name: string;
  note: string;
  style: MaquetaStyle;
  slides: MaquetaSlide[];
  basedOn: string | null;
  team: boolean;
}

const GRID: Record<MaquetaFormat, string> = {
  carrusel: 'grid-cols-2 sm:grid-cols-3',
  post: 'grid-cols-2 sm:grid-cols-3',
  historia: 'grid-cols-2 sm:grid-cols-4',
  portada: 'grid-cols-1 sm:grid-cols-2',
};

function OptionCard({
  option,
  format,
  on,
  onPick,
}: {
  option: Option;
  format: MaquetaFormat;
  on: boolean;
  onPick: () => void;
}) {
  const cover = option.slides[0];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className="group grid min-w-0 content-start gap-2 rounded-[14px] text-left focus-visible:outline-offset-4"
    >
      <span
        className={clsx(
          'relative block rounded-[12px] p-1.5 transition',
          on
            ? 'bg-sheet ring-2 ring-marker'
            : 'ring-1 ring-transparent group-hover:bg-sheet group-hover:ring-rule-strong',
        )}
      >
        {cover && (
          <MaquetaSlideView
            format={format}
            style={option.style}
            slide={cover}
            index={0}
            total={option.slides.length}
          />
        )}
        {on && (
          <span className="absolute top-3.5 right-3.5 grid size-7 place-items-center rounded-full bg-marker text-on-marker shadow-[0_6px_14px_-6px_rgb(255_79_0/0.8)]">
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </span>
        )}
      </span>
      <span className="min-w-0 px-1.5">
        <span className="block truncate text-[0.9rem] font-[700] text-ink">{option.name}</span>
        <span className="block truncate text-[0.78rem] text-ink-2">{option.note}</span>
      </span>
    </button>
  );
}

function Composer({
  content,
  origin,
  topicName,
  initialFormat,
  desde,
  back,
}: {
  content: AdaptationContent | null;
  origin: MaquetaOrigin | null;
  topicName: string;
  initialFormat: MaquetaFormat | null;
  desde: string | null;
  back?: { href: string; label: string };
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [profile] = useProfile();
  const brand = useMemo(() => brandFrom(profile), [profile]);
  const { data: cached, error: teamError } = useApi<Maqueta[]>(content ? '/api/v1/maquetas' : null);
  // The maqueta being reused comes straight from the API: the cached list may predate its last save.
  const fresh = useFreshMaqueta(content ? desde : null);
  const team = useMemo(() => {
    const own = fresh?.data;
    if (!cached || !own) return cached;
    return [own, ...cached.filter((m) => m.id !== own.id)];
  }, [cached, fresh]);
  const teamReady =
    !content || ((team !== undefined || teamError !== undefined) && (!desde || fresh !== null));
  const source = desde ? (team?.find((m) => m.id === desde) ?? null) : null;

  const [picked, setPicked] = useState<MaquetaFormat | null>(initialFormat);
  const format = picked ?? source?.format ?? 'carrusel';
  const spec = FORMAT_SPEC[format];

  const base = useMemo(
    () => (content ? slidesFromAdaptation(content, format, topicName) : blankSlides(format)),
    [content, format, topicName],
  );

  const options = useMemo<Option[]>(
    () => [
      ...(content ? (team ?? []) : []).map((m) => ({
        key: `m:${m.id}`,
        name: m.name,
        note:
          m.id === desde
            ? 'La que estás reusando'
            : m.format === format
              ? 'Del equipo'
              : `Del equipo · era ${lowerFirst(FORMAT_SPEC[m.format].label)}`,
        style: m.style,
        slides: slidesInMaqueta(m, base),
        basedOn: m.id,
        team: true,
      })),
      ...PRESETS.map((p) => ({
        key: `p:${p.id}`,
        name: p.name,
        note: 'Estilo base',
        style: styleFrom(p.id, brand),
        slides: base,
        basedOn: null,
        team: false,
      })),
    ],
    [content, team, base, brand, desde, format],
  );

  const [choice, setChoice] = useState<string | null>(null);
  const fallbackKey = source ? `m:${source.id}` : `p:${PRESETS[0]!.id}`;
  const selected =
    options.find((o) => o.key === (choice ?? fallbackKey)) ??
    options.find((o) => o.key === fallbackKey) ??
    options.find((o) => !o.team)!;

  const [view, setView] = useState(0);
  const shown = Math.min(view, selected.slides.length - 1);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const created = await post<Maqueta>(
        '/api/v1/maquetas',
        cleanInput({
          name: maquetaName(origin, format),
          format,
          style: selected.style,
          slides: selected.slides,
          origin,
          basedOn: selected.basedOn,
        }),
      );
      void mutate('/api/v1/maquetas', listWith(created));
      router.replace(`/maquetas/${created.id}`);
    } catch (e) {
      toast.error(messageOf(e, 'No se pudo armar la maqueta.'));
      setCreating(false);
    }
  };

  const teamOptions = options.filter((o) => o.team);
  const presetOptions = options.filter((o) => !o.team);
  const ratio = spec.width / spec.height;

  const grid = (list: Option[]) => (
    <div role="radiogroup" aria-label="Maqueta" className={clsx('grid gap-3', GRID[format])}>
      {list.map((o) => (
        <OptionCard
          key={o.key}
          option={o}
          format={format}
          on={o.key === selected.key}
          onPick={() => {
            setChoice(o.key);
            setView(0);
          }}
        />
      ))}
    </div>
  );

  const createButton = (className?: string) => (
    <Button
      variant="primary"
      size="lg"
      loading={creating}
      disabled={!teamReady}
      onClick={() => void create()}
      icon={<LayoutTemplate className="size-5" aria-hidden />}
      className={clsx('rounded-[12px]!', className)}
    >
      {creating ? 'Armando…' : 'Armar maqueta'}
    </Button>
  );

  return (
    <Page className="grid gap-6 pb-24 lg:pb-0">
      <PageHead
        crumbs={CRUMBS}
        title={content ? '¿Con qué maqueta lo armamos?' : 'Nueva maqueta en blanco'}
        lead={
          content
            ? `El texto de «${topicName}» ya está escrito. Elige cómo se ve; en el editor cambias colores, letra y cada lámina.`
            : 'Elige el formato y un estilo para empezar. El texto es de ejemplo: lo cambias en el editor.'
        }
        actions={
          back && (
            <Link
              href={back.href}
              className="inline-flex h-10 items-center rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.9rem] font-[650] text-ink transition hover:border-ink"
            >
              {back.label}
            </Link>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <div className="grid min-w-0 gap-7">
          <section className="grid gap-2.5">
            <MonoLabel>Formato</MonoLabel>
            <div
              role="radiogroup"
              aria-label="Formato"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {FORMATS_ORDER.map((f) => {
                const on = f === format;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setPicked(f);
                      setView(0);
                    }}
                    className={clsx(
                      'flex min-w-0 items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition',
                      on
                        ? 'border-ink bg-ink text-sheet'
                        : 'border-rule bg-sheet text-ink hover:border-rule-strong',
                    )}
                  >
                    <FormatGlyph
                      format={f}
                      size={22}
                      className={on ? 'text-marker' : 'text-ink-2'}
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.88rem] leading-tight font-[700]">
                        {FORMAT_SPEC[f].label}
                      </span>
                      <span
                        className={clsx(
                          'mt-0.5 block text-[0.74rem] leading-snug',
                          on ? 'text-sheet/70' : 'text-ink-2',
                        )}
                      >
                        {FORMAT_SPEC[f].hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {content && (
            <section className="grid gap-2.5">
              <MonoLabel>Del equipo{team?.length ? ` · ${team.length}` : ''}</MonoLabel>
              {!team && !teamError ? (
                <div className={clsx('grid gap-3', GRID[format])}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="aspect-[4/5]" />
                  ))}
                </div>
              ) : teamOptions.length ? (
                grid(teamOptions)
              ) : (
                <p className="rounded-[12px] border border-dashed border-rule-strong px-4 py-3 text-[0.88rem] text-ink-2">
                  {teamError
                    ? 'No pudimos leer las maquetas del equipo. Puedes empezar con un estilo base.'
                    : 'Todavía no hay maquetas del equipo. La que armes hoy aparece aquí para el próximo tema.'}
                </p>
              )}
            </section>
          )}

          <section className="grid gap-2.5">
            <MonoLabel>Estilos base</MonoLabel>
            {grid(presetOptions)}
          </section>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-[76px]">
          <section className="grid gap-3 rounded-[14px] border border-rule bg-sheet p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <MonoLabel>Así queda</MonoLabel>
                <p className="mt-1 truncate text-[1rem] font-[700] text-ink">{selected.name}</p>
              </div>
              <span className="shrink-0 text-[0.8rem] text-ink-2">
                {spec.label} · {slidesCount(selected.slides.length)}
              </span>
            </div>
            <div className="grid place-items-center rounded-[12px] bg-sheet-2 p-3">
              <div style={{ width: `min(100%, calc((100dvh - 430px) * ${ratio.toFixed(4)}))` }}>
                <MaquetaSlideView
                  format={format}
                  style={selected.style}
                  slide={selected.slides[shown]!}
                  index={shown}
                  total={selected.slides.length}
                  className="shadow-[0_18px_36px_-20px_rgb(32_21_21/0.55)]"
                />
              </div>
            </div>
            {selected.slides.length > 1 && (
              <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Láminas">
                {selected.slides.map((s, i) => (
                  <li key={i} className="w-[54px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setView(i)}
                      aria-label={`Ver la lámina ${i + 1}`}
                      aria-current={i === shown ? 'true' : undefined}
                      className={clsx(
                        'block w-full rounded-[7px] p-0.5 transition',
                        i === shown ? 'ring-2 ring-marker' : 'opacity-75 hover:opacity-100',
                      )}
                    >
                      <MaquetaSlideView
                        format={format}
                        style={selected.style}
                        slide={s}
                        index={i}
                        total={selected.slides.length}
                      />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="hidden lg:grid">{createButton('w-full')}</div>
            <p className="text-[0.8rem] text-ink-3">
              Queda en Maquetas: ahí la editas, la descargas en PNG y la programas.
            </p>
          </section>
          <DarkNote className="hidden lg:flex">
            <ShieldCheck className="size-5 shrink-0" aria-hidden />
            Nada se publica solo. Una persona aprueba cada pieza.
          </DarkNote>
        </aside>
      </div>

      <div className="material fixed inset-x-0 bottom-0 z-30 border-t border-rule px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="mx-auto flex max-w-[560px] items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[0.84rem] text-ink-2">
            <span className="font-[700] text-ink">{selected.name}</span> · {spec.label}
          </p>
          {createButton('shrink-0')}
        </div>
      </div>
    </Page>
  );
}
