'use client';

import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { ArrowUpRight, PenLine, RefreshCw, Search, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  CopyButton,
  FORMATS,
  FormatBody,
  textOf,
  type Format,
} from '@/components/adaptation-panel';
import { Page } from '@/components/shell';
import { Button, Empty, Input, Skeleton, fmtCompact, fmtInt } from '@/components/ui';
import { ApiError, del, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import {
  LANG_COPY,
  LANG_SHORT,
  PLATFORM_COPY,
  type AdaptationContent,
  type WatchDetail,
  type WatchHit,
  type WatchReport,
  type WatchStep,
  type WatchSummary,
} from '@/lib/types';

const usd = (n: number) =>
  `USD ${n.toLocaleString('es-CO', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);

/** «hace 5 min», «hace 3 h», «hace 2 días». */
function ago(iso: string): string {
  const minutes = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${Math.round(minutes)} min`;
  if (minutes < 48 * 60) return `hace ${Math.round(minutes / 60)} h`;
  return `hace ${Math.round(minutes / 1440)} días`;
}

const fmtTime = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
});

const SOURCE_COPY: Record<string, string> = {
  youtube: 'YouTube',
  bluesky: 'Bluesky',
  hn: 'Hacker News',
  instagram: 'los perfiles de Instagram que sigue el radar',
};

function stepCopy(step: WatchStep, windowHours: number): string {
  switch (step) {
    case 'encontradas':
      return 'Encontradas';
    case 'idioma':
      return 'En inglés o portugués';
    case 'tema':
      return 'Hablan del tema';
    case 'reciente':
      return `De las últimas ${windowHours} h`;
    case 'viral':
      return 'Virales';
    case 'nuevo':
      return 'Nuevas';
    case 'presupuesto':
      return 'Atrapadas';
  }
}

const RULE_COPY: Record<WatchStep, string> = {
  encontradas: '',
  idioma: 'Otro idioma',
  tema: 'No son del tema',
  reciente: 'Muy viejas',
  viral: 'No despegaron',
  nuevo: 'Ya atrapadas',
  presupuesto: 'Fuera del presupuesto',
};

// ------------------------------------------------------------------ follow

function FollowForm({ onFollowed }: { onFollowed: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await post<{ id: string; term: string }>('/api/v1/watches', { term });
      setTerm('');
      onFollowed(created.id);
      toast('Siguiendo el tema', {
        description: `Primera búsqueda de «${created.term}» en curso.`,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo seguir el tema.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex w-full max-w-xl flex-wrap items-center gap-2">
      <label htmlFor="term" className="sr-only">
        Tema a seguir
      </label>
      <Input
        id="term"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Un tema: negocios, ventas, liderazgo…"
        className="h-11 min-w-0 flex-1 text-[1rem]"
        maxLength={60}
      />
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        icon={<Search className="size-4" aria-hidden />}
      >
        {busy ? 'Preparando la búsqueda…' : 'Seguir'}
      </Button>
    </form>
  );
}

// ------------------------------------------------------------------ funnel

/**
 * The search as a funnel: what each rule let through, on a log scale so the last steps still
 * show. A line marks where tokens start: everything above it is decided by rules, for free.
 */
function Funnel({ report, windowHours }: { report: WatchReport; windowHours: number }) {
  const max = Math.max(1, report.steps[0]?.left ?? 1);
  const width = (n: number) =>
    n <= 0 ? 0 : Math.max(2, (Math.log10(n + 1) / Math.log10(max + 1)) * 100);
  return (
    <ol className="grid gap-1.5">
      {report.steps.map((s, i) => {
        const last = s.step === 'presupuesto';
        return (
          <li key={s.step} className="grid">
            {last && (
              <div className="my-2 flex items-center gap-3 text-[0.8rem] font-[650] text-marker-strong">
                <span className="h-px flex-1 bg-marker/60" aria-hidden />
                Desde aquí se gastan tokens
                <span className="h-px flex-1 bg-marker/60" aria-hidden />
              </div>
            )}
            <div className="grid grid-cols-[1.4rem_minmax(0,11rem)_minmax(0,1fr)_3.5rem] items-center gap-x-3 sm:grid-cols-[1.4rem_13rem_minmax(0,1fr)_4rem]">
              <span className="t-figure text-[0.9rem] text-ink-3">{i + 1}</span>
              <span
                className={clsx(
                  'truncate text-[0.92rem]',
                  last ? 'font-[720] text-ink' : 'text-ink-2',
                )}
              >
                {stepCopy(s.step, windowHours)}
              </span>
              <span className="h-3 overflow-hidden rounded-full bg-fill" aria-hidden>
                <span
                  className={clsx('block h-full rounded-full', last ? 'bg-marker' : 'bg-brand/55')}
                  style={{ width: `${width(s.left)}%` }}
                />
              </span>
              <span
                className={clsx(
                  't-figure text-right text-[1.05rem]',
                  last ? 'text-ink' : 'text-ink-2',
                )}
              >
                {fmtInt(s.left)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Rejections({ report }: { report: WatchReport }) {
  const stopped = report.rejected.filter((r) => r.count > 0);
  if (!stopped.length) return null;
  return (
    <details className="group border-t border-rule pt-3">
      <summary className="cursor-pointer text-[0.9rem] font-[650] text-brand">
        Por qué se descartaron
      </summary>
      <ul className="mt-3 grid gap-3">
        {stopped.map((r) => (
          <li key={r.rule} className="grid gap-1">
            <p className="text-[0.9rem] text-ink">
              <span className="font-[700]">{RULE_COPY[r.rule]}</span>: {fmtInt(r.count)}
            </p>
            <ul className="grid gap-0.5 text-[0.84rem] text-ink-2">
              {r.examples.map((e) => (
                <li key={e.title} className="truncate">
                  «{e.title}». {e.reason}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ------------------------------------------------------------------ caught pieces

function metricsOf(hit: WatchHit): string {
  const p = hit.piece;
  const out: string[] = [];
  if (p.views) out.push(`${fmtCompact(p.views)} vistas`);
  if (p.likes) out.push(`${fmtCompact(p.likes)} ${p.platform === 'hn' ? 'puntos' : 'reacciones'}`);
  if (p.comments) out.push(`${fmtCompact(p.comments)} comentarios`);
  if (p.shares) out.push(`${fmtCompact(p.shares)} compartidos`);
  return out.join(', ');
}

function LangBadge({ lang }: { lang: 'en' | 'pt' }) {
  return (
    <span
      className={clsx(
        'rounded-[5px] px-1.5 text-[0.7rem] leading-[1.15rem] font-[760] text-white',
        lang === 'pt' ? 'bg-lang-pt' : 'bg-lang-en',
      )}
      title={LANG_COPY[lang]}
    >
      {LANG_SHORT[lang]}
    </span>
  );
}

function Slides({ slides }: { slides: NonNullable<NonNullable<WatchHit['capture']>['slides']> }) {
  return (
    <ol
      className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2"
      aria-label="Láminas del carrusel"
    >
      {slides.map((s) => (
        <li key={s.n} className="grid w-40 shrink-0 snap-start content-start gap-1.5">
          <img
            src={s.image}
            alt={s.text ? `Lámina ${s.n}: ${s.text}` : `Lámina ${s.n}`}
            className="aspect-[4/5] w-40 rounded-[10px] bg-fill object-cover"
            loading="lazy"
          />
          {s.es && <p className="line-clamp-5 text-[0.82rem] leading-snug text-ink">{s.es}</p>}
        </li>
      ))}
    </ol>
  );
}

function PieceAdaptation({ a }: { a: AdaptationContent }) {
  const [format, setFormat] = useState<Format>('linkedin');
  return (
    <div className="grid gap-4 rounded-[16px] bg-sheet-2 p-4">
      <div>
        <p className="text-[0.8rem] font-[700] text-ink-3">El ángulo de 30X</p>
        <p className="mt-0.5 leading-snug font-[650] text-ink">{a.angle}</p>
      </div>
      <ul className="grid gap-1.5 md:grid-cols-3">
        {a.hooks.map((h) => (
          <li key={h} className="rounded-[12px] bg-sheet px-3 py-2 text-[0.92rem] text-ink">
            {h}
          </li>
        ))}
      </ul>
      <Tabs.Root
        value={format}
        onValueChange={(v) => setFormat(v as Format)}
        className="grid gap-3"
      >
        <Tabs.List
          className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1"
          aria-label="Formato"
        >
          {FORMATS.map((f) => (
            <Tabs.Trigger
              key={f.value}
              value={f.value}
              className="rounded-full px-3.5 py-1.5 text-[0.86rem] font-[650] whitespace-nowrap text-ink-2 data-[state=active]:bg-sheet data-[state=active]:text-ink data-[state=active]:shadow-sheet"
            >
              {f.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {FORMATS.map((f) => (
          <Tabs.Content key={f.value} value={f.value} className="grid gap-3 outline-none">
            <div className="flex justify-end">
              <CopyButton text={textOf(a, f.value)} />
            </div>
            <FormatBody a={a} format={f.value} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </div>
  );
}

function HitRow({
  hit,
  watchId,
  onAdapted,
}: {
  hit: WatchHit;
  watchId: string;
  onAdapted: () => void;
}) {
  const p = hit.piece;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const c = hit.capture;
  const adapt = async () => {
    if (hit.adaptation) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    try {
      await post(`/api/v1/watches/${watchId}/hits/${encodeURIComponent(p.id)}/adapt`, {});
      onAdapted();
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo escribir ahora.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="grid gap-3 px-5 py-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] text-ink-3">
        <LangBadge lang={hit.lang} />
        <span className="font-[700] text-ink-2">{p.authorName}</span>
        <span>
          {PLATFORM_COPY[p.platform]}, {ago(p.publishedAt)}
          {metricsOf(hit) ? `, ${metricsOf(hit)}` : ''}
        </span>
      </div>
      <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          lang={hit.lang}
          className="group line-clamp-4 text-[0.98rem] leading-snug text-ink-2 hover:text-brand"
        >
          {p.title || p.text}{' '}
          <ArrowUpRight
            className="inline size-3.5 text-ink-3 group-hover:text-brand"
            aria-label="Abrir el original"
          />
        </a>
        <div className="grid content-start gap-1.5">
          <p className="text-[1.04rem] leading-snug font-[600] text-ink">
            <span className="sr-only">En español: </span>
            {c?.idea ?? c?.es ?? 'Sin traducción todavía.'}
          </p>
          {c?.idea && c.es && <p className="text-[0.88rem] text-ink-2">{c.es}</p>}
        </div>
      </div>
      {c?.slides && c.slides.length > 0 && <Slides slides={c.slides} />}
      {c?.video && (
        <div className="grid gap-1.5 rounded-[14px] bg-sheet-2 px-4 py-3">
          <p className="text-[0.92rem] text-ink">
            <span className="font-[700]">Primeros segundos: </span>
            {c.video.hook}
          </p>
          <ol className="grid list-decimal gap-0.5 pl-5 text-[0.9rem] text-ink-2">
            {c.video.points.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ol>
          <p className="text-[0.76rem] text-ink-3">
            Leído de sus subtítulos ({fmtInt(c.video.transcriptChars)} caracteres).
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-1.5">
          {hit.reasons.map((r) => (
            <li key={r} className="rounded-full bg-fill px-2.5 py-0.5 text-[0.78rem] text-ink-2">
              {r.replace(/\.$/, '')}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant={hit.adaptation ? 'secondary' : 'primary'}
          loading={busy}
          onClick={adapt}
          icon={<PenLine className="size-4" aria-hidden />}
        >
          {busy
            ? 'Escribiendo…'
            : hit.adaptation
              ? open
                ? 'Ocultar la versión en español'
                : 'Ver la versión en español'
              : 'Adáptalo al español'}
        </Button>
      </div>
      {open && hit.adaptation && <PieceAdaptation a={hit.adaptation} />}
    </li>
  );
}

// ------------------------------------------------------------------ page

function WatchView({ id, onStopped }: { id: string; onStopped: () => void }) {
  const { data, error, mutate } = useApi<WatchDetail>(`/api/v1/watches/${id}`, {
    refreshInterval: (d) => (d?.watch.running ? 3000 : 60_000),
  });
  if (error) return <Empty title="No encontramos ese tema" />;
  if (!data) return <Skeleton className="h-96" />;
  const { watch, run, hits } = data;
  const report = run?.report ?? null;
  const searchNow = async () => {
    try {
      await post(`/api/v1/watches/${id}/run`, {});
      await mutate();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo buscar ahora.');
    }
  };
  const stop = async () => {
    await del(`/api/v1/watches/${id}`);
    onStopped();
  };
  const searched = report?.sources
    .filter((s) => s.source !== 'youtube-detalle')
    .reduce<Record<string, number>>((acc, s) => {
      acc[s.source] = (acc[s.source] ?? 0) + s.found;
      return acc;
    }, {});
  const opened = report?.sources.find((s) => s.source === 'youtube-detalle')?.found ?? 0;

  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="t-h1 text-ink">«{watch.term}»</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={watch.running}
              onClick={searchNow}
              icon={<RefreshCw className="size-4" aria-hidden />}
            >
              {watch.running ? 'Buscando…' : 'Buscar ahora'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={stop}
              icon={<X className="size-4" aria-hidden />}
            >
              Dejar de seguir
            </Button>
          </div>
        </div>
        <p className="max-w-3xl text-ink-2" role="status">
          {watch.running
            ? 'Buscando ahora en YouTube, Bluesky, Hacker News e Instagram. Tarda uno o dos minutos.'
            : `Busca cada ${watch.everyMinutes === 60 ? 'hora' : `${watch.everyMinutes} minutos`} en inglés y portugués.${
                watch.lastRunAt ? ` La última búsqueda fue ${ago(watch.lastRunAt)}` : ''
              }${watch.nextRunAt ? `; la próxima, a las ${fmtTime.format(new Date(watch.nextRunAt))}.` : '.'}`}
        </p>
        <dl className="grid gap-1 text-[0.86rem] text-ink-3 sm:grid-cols-2">
          {watch.langs.map((l) => (
            <div key={l} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <dt>
                <LangBadge lang={l} />
              </dt>
              <dd>{watch.plan[l].queries.map((q) => `«${q}»`).join(', ')}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <section className="grid gap-3">
          <h3 className="t-h2 text-ink">Lo que atrapó</h3>
          {hits.length ? (
            <ol className="sheet divide-y divide-rule">
              {hits.map((h) => (
                <HitRow key={h.piece.id} hit={h} watchId={id} onAdapted={() => void mutate()} />
              ))}
            </ol>
          ) : (
            <Empty title={watch.running ? 'Buscando…' : 'Todavía nada'}>
              {watch.running
                ? 'Lo que pase todas las reglas aparece aquí apenas termine la búsqueda.'
                : 'Ninguna pieza pasó todas las reglas en esta búsqueda. La próxima vuelve a intentarlo.'}
            </Empty>
          )}
        </section>

        <aside className="sheet grid gap-4 p-5 lg:sticky lg:top-20">
          <div>
            <h3 className="t-h3 text-ink">La última búsqueda</h3>
            <p className="mt-1 text-[0.88rem] text-ink-2">
              Las reglas deciden sin gastar tokens; solo lo atrapado se lee, se traduce y se
              transcribe.
            </p>
          </div>
          {report ? (
            <>
              <Funnel report={report} windowHours={watch.windowHours} />
              <p className="text-[0.9rem] text-ink">
                Leer las {fmtInt(report.caught)} atrapadas costó{' '}
                <span className="font-[720]">{usd(report.costUsd)}</span> (
                {fmtInt(report.tokens.input + report.tokens.output)} tokens).
              </p>
              {searched && (
                <p className="text-[0.82rem] text-ink-3">
                  Buscó en{' '}
                  {list(
                    Object.entries(searched).map(
                      ([s, n]) => `${SOURCE_COPY[s] ?? s} (${fmtInt(n)})`,
                    ),
                  )}
                  .
                  {opened > 0 &&
                    ` Abrió ${fmtInt(opened)} videos de YouTube para leer su fecha exacta, su canal y sus métricas.`}
                </p>
              )}
              <Rejections report={report} />
            </>
          ) : run?.error ? (
            <p className="text-[0.9rem] text-ink-2">La búsqueda falló: {run.error}</p>
          ) : (
            <p className="text-[0.9rem] text-ink-2">La primera búsqueda está en curso.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function WatchPage() {
  const { data: watches, mutate } = useApi<WatchSummary[]>('/api/v1/watches');
  const [chosen, setSelected] = useState<string | null>(null);
  // The first followed topic is open until another one is chosen.
  const selected =
    (watches?.some((w) => w.id === chosen) ? chosen : null) ?? watches?.[0]?.id ?? null;

  return (
    <Page className="grid gap-8">
      <header className="grid gap-4">
        <h1 className="t-display max-w-4xl text-ink">Vigía</h1>
        <p className="max-w-2xl text-[1.1rem] leading-relaxed text-ink-2">
          Sigue un tema y el radar lo busca cada hora en inglés y portugués, donde lo viral sobre IA
          suele nacer. Atrapa lo que despega antes de que llegue al español, con su texto, sus
          láminas o su video leídos para adaptarlo.
        </p>
        <FollowForm
          onFollowed={(id) => {
            setSelected(id);
            void mutate();
          }}
        />
      </header>

      {watches && watches.length > 0 && (
        <div
          className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1"
          role="tablist"
          aria-label="Temas que sigues"
        >
          {watches.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === selected}
              onClick={() => setSelected(w.id)}
              className={clsx(
                'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.9rem] font-[650] whitespace-nowrap',
                w.id === selected ? 'bg-sheet text-ink shadow-sheet' : 'text-ink-2 hover:text-ink',
              )}
            >
              {w.term}
              <span className="t-figure text-[0.82rem] text-ink-3">
                {w.running ? '…' : fmtInt(w.caught)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <WatchView
          key={selected}
          id={selected}
          onStopped={() => {
            setSelected(null);
            void mutate();
          }}
        />
      ) : (
        watches && (
          <Empty title="Todavía no sigues ningún tema">
            Escribe uno arriba, por ejemplo «negocios». La primera búsqueda empieza enseguida.
          </Empty>
        )
      )}
    </Page>
  );
}
