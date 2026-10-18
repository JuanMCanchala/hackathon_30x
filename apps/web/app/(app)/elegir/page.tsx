'use client';

/**
 * «Elegir»: the week's topics that fit 30X, one card at a time, best fit first. Right if it
 * serves, left if not, down for later. Decisions live in this browser (lib/workspace); a «Sirve»
 * also asks the API for the first draft so it is ready when the team opens it.
 */
import clsx from 'clsx';
import {
  Bookmark,
  Check,
  FileText,
  HardDrive,
  RotateCcw,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent } from 'react';
import { BackCard, FrontCard, skin } from '@/components/elegir-deck';
import {
  Card,
  DarkNote,
  IconTile,
  MomentChip,
  MonoLabel,
  PageHead,
  StageChip,
} from '@/components/kit';
import { Page } from '@/components/shell';
import { Button, Empty, Skeleton, fmtInt } from '@/components/ui';
import { post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import {
  LANG_SHORT,
  LANGS,
  type Lang,
  type Radar,
  type RadarTopic,
  type TopicDetail,
} from '@/lib/types';
import { useDecisions, type Decision } from '@/lib/workspace';

/** «11–18 oct», read in UTC like the radar's own week label. */
function weekCrumb(start: string, end: string): string {
  const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
  const a = new Date(start);
  const b = new Date(end);
  const ma = month.format(a).replace('.', '');
  const mb = month.format(b).replace('.', '');
  return ma === mb
    ? `Semana ${day.format(a)}–${day.format(b)} ${mb}`
    : `Semana ${day.format(a)} ${ma} – ${day.format(b)} ${mb}`;
}

const LANG_FG: Record<Lang, string> = {
  en: 'text-lang-en',
  pt: 'text-lang-pt',
  es: 'text-lang-es',
};

/** «EN ↑ 555 % · PT aún no · ES 5 creadores»: where the topic grows, and how full Spanish is. */
function LangLine({ topic }: { topic: RadarTopic }) {
  return (
    <span className="text-[0.86rem] text-ink-2">
      {LANGS.map((l, i) => {
        const w = topic.languages[l];
        const present = w.creators > 0 && w.stage !== 'ausente';
        const body = !present
          ? 'aún no'
          : l === 'es'
            ? `${fmtInt(w.creators)} ${w.creators === 1 ? 'creador' : 'creadores'}`
            : `${w.growthPct >= 0 ? '↑' : '↓'} ${fmtInt(Math.abs(w.growthPct))} %`;
        return (
          <span key={l} className="whitespace-nowrap">
            {i > 0 && <span className="text-ink-3"> · </span>}
            <b className={clsx('font-[700]', LANG_FG[l])}>{LANG_SHORT[l]}</b> {body}
          </span>
        );
      })}
    </span>
  );
}

/** Where the front card flies when a decision is made. */
const EXIT: Record<Decision, string> = {
  sirve: 'translateX(140%) rotate(16deg)',
  no: 'translateX(-140%) rotate(-16deg)',
  despues: 'translateY(70%) scale(0.85)',
};

const SWIPE = 110;

export default function ElegirPage() {
  const { data: radar, error } = useApi<Radar>('/api/v1/radar');
  const [decisions, decide] = useDecisions();
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null);

  const week = useMemo(
    () =>
      [...(radar?.topics ?? [])].sort((a, b) => (b.fit ?? -1) - (a.fit ?? -1) || a.rank - b.rank),
    [radar],
  );
  const deck = week.filter((t) => !decisions[t.id]);
  const approved = week.filter((t) => decisions[t.id] === 'sirve');
  const later = week.filter((t) => decisions[t.id] === 'despues').length;
  const discarded = week.filter((t) => decisions[t.id] === 'no').length;
  const [current, next, third] = deck;

  const { data: detail } = useApi<TopicDetail>(current ? `/api/v1/topics/${current.id}` : null);
  // Warm the next card's detail so it shows at once.
  useApi<TopicDetail>(next ? `/api/v1/topics/${next.id}` : null);
  const fresh = detail && current && detail.topic.id === current.id ? detail : null;
  const piece = fresh ? (fresh.inspiration[0] ?? fresh.evidence[0] ?? null) : null;

  function choose(d: Decision) {
    if (!current || leaving) return;
    const id = current.id;
    setLeaving(d);
    setDrag(null);
    // Fire and forget: the draft is ready when the team opens it; errors surface there.
    if (d === 'sirve') post(`/api/v1/topics/${id}/adaptations`, { variant: 0 }).catch(() => {});
    window.setTimeout(() => {
      decide(id, d);
      setLeaving(null);
    }, 280);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const d: Decision | null =
        e.key === 'ArrowRight'
          ? 'sirve'
          : e.key === 'ArrowLeft'
            ? 'no'
            : e.key === 'ArrowDown'
              ? 'despues'
              : null;
      if (!d) return;
      e.preventDefault();
      choose(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, dx: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag) setDrag({ x: drag.x, dx: e.clientX - drag.x });
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.dx > SWIPE) choose('sirve');
    else if (drag.dx < -SWIPE) choose('no');
    else setDrag(null);
  };

  const restart = (only?: Decision) =>
    week.forEach((t) => {
      if (decisions[t.id] && (!only || decisions[t.id] === only)) decide(t.id, null);
    });

  const dx = drag?.dx ?? 0;
  const frontStyle: CSSProperties = leaving
    ? { transform: EXIT[leaving], opacity: 0 }
    : drag
      ? { transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: 'none' }
      : {};

  const total = week.length;
  const counter = total ? `${Math.min(total - deck.length + 1, total)} / ${fmtInt(total)}` : null;

  return (
    <Page>
      <PageHead
        crumbs={[
          { label: 'Elegir', href: '/elegir' },
          ...(radar ? [{ label: weekCrumb(radar.week.start, radar.week.end) }] : []),
        ]}
        title="Desliza las ondas. Quédate con las que sirven."
        lead="OndAI ordena los temas por encaje con 30X. A la derecha si sirve, a la izquierda si no."
        actions={
          counter && (
            <span
              className="rounded-[8px] bg-fill px-3 py-1.5 text-[0.92rem] font-[600] text-ink tabular-nums"
              aria-label={`Tema ${counter.replace(' / ', ' de ')}`}
            >
              {counter}
            </span>
          )
        }
      />

      {error && !radar ? (
        <div className="mt-6">
          <Empty title="No se pudo abrir la semana">{error.message}</Empty>
        </div>
      ) : !radar ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="h-[640px]" />
          <Skeleton className="h-[640px]" />
        </div>
      ) : total === 0 ? (
        <div className="mt-6">
          <Empty title="Esta semana no hay temas para elegir">
            El radar no encontró temas que encajen con 30X. Vuelve después de la próxima búsqueda.
          </Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* ------------------------------------------------ deck */}
          <div className="min-w-0">
            {current ? (
              <>
                <div className="grid h-[460px] place-items-center sm:h-[500px] [&>*]:[grid-area:1/1]">
                  {third && (
                    <BackCard
                      topic={third}
                      className="translate-x-[28px] scale-[0.86] rotate-[9deg] opacity-90 sm:translate-x-[180px]"
                    />
                  )}
                  {next && (
                    <BackCard
                      topic={next}
                      className="-translate-x-[28px] scale-[0.86] -rotate-[9deg] opacity-90 sm:-translate-x-[180px]"
                    />
                  )}
                  <div className="relative">
                    <FrontCard
                      key={current.id}
                      topic={current}
                      piece={piece}
                      loading={!fresh}
                      style={frontStyle}
                      className="cursor-grab transition-[transform,opacity] duration-300 ease-out active:cursor-grabbing"
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={() => setDrag(null)}
                    />
                    {drag && Math.abs(dx) > 30 && (
                      <span
                        className={clsx(
                          'pointer-events-none absolute top-14 rounded-[8px] border-[3px] px-3 py-1 text-[1.1rem] font-[800] tracking-[0.06em] uppercase',
                          dx > 0
                            ? 'left-5 -rotate-12 border-marker bg-sheet/90 text-marker-strong'
                            : 'right-5 rotate-12 border-held bg-sheet/90 text-held',
                        )}
                        style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE) }}
                        aria-hidden
                      >
                        {dx > 0 ? 'Sirve' : 'No sirve'}
                      </span>
                    )}
                  </div>
                </div>

                <section className="mx-auto mt-4 max-w-[560px] rounded-[14px] border border-rule bg-sheet p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <MonoLabel>Tema detectado</MonoLabel>
                      <h2 className="mt-1 text-[1.2rem] leading-tight font-[700] text-ink">
                        {current.name}
                      </h2>
                    </div>
                    {current.fit !== null && (
                      <span
                        className="grid shrink-0 justify-items-center rounded-[10px] bg-ink px-3 py-1.5 text-sheet"
                        title={`Encaje con 30X: ${current.fit} de 10`}
                      >
                        <span className="text-[1.25rem] leading-none font-[700] tabular-nums">
                          {current.fit}/10
                        </span>
                        <span className="mt-0.5 text-[0.68rem] text-sheet/75">encaje</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
                    <StageChip stage={current.stage} />
                    <MomentChip timing={current.timing} />
                    <span className="inline-flex items-center rounded-[6px] bg-fill px-2 py-[3px] font-mono text-[0.74rem] font-[700] text-ink tabular-nums">
                      {current.growthPct >= 0 ? '+' : '−'}
                      {fmtInt(Math.abs(current.growthPct))} %
                    </span>
                    <LangLine topic={current} />
                  </div>
                  {current.why && (
                    <p className="mt-3 text-[0.92rem] leading-snug text-ink">{current.why}</p>
                  )}
                  <Link
                    href={`/tema/${current.id}`}
                    className="mt-2 inline-block text-[0.92rem] font-[700] text-ink underline underline-offset-2 hover:text-brand"
                  >
                    Ver el tema
                  </Link>
                </section>

                <div className="mx-auto mt-6 grid max-w-[420px] grid-cols-3 items-center justify-items-center gap-2">
                  <button
                    type="button"
                    onClick={() => choose('no')}
                    aria-label="No sirve (flecha izquierda)"
                    className="grid size-[72px] place-items-center rounded-full border border-rule bg-sheet text-held shadow-sheet transition hover:-translate-y-0.5 hover:border-rule-strong"
                  >
                    <X className="size-7" strokeWidth={2.4} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => choose('despues')}
                    aria-label="Para después (flecha abajo)"
                    className="grid size-14 place-items-center rounded-full border border-rule bg-sheet text-brand shadow-sheet transition hover:-translate-y-0.5 hover:border-rule-strong"
                  >
                    <Bookmark className="size-5" strokeWidth={2.2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => choose('sirve')}
                    aria-label="Sirve (flecha derecha)"
                    className="grid size-[88px] place-items-center rounded-full bg-marker text-on-marker shadow-[0_12px_28px_-10px_rgb(255_79_0/0.7)] transition hover:-translate-y-0.5 hover:bg-marker-strong"
                  >
                    <Check className="size-9" strokeWidth={2.6} aria-hidden />
                  </button>
                  <span className="text-[0.92rem] text-ink-2">← No sirve</span>
                  <span className="text-center text-[0.92rem] text-ink-2">Para después</span>
                  <span className="text-[0.92rem] text-ink-2">Sirve →</span>
                </div>
                <p className="mt-3 hidden text-center text-[0.8rem] text-ink-3 sm:block">
                  También con el teclado: ← no sirve, ↓ para después, → sirve.
                </p>
              </>
            ) : (
              <Card className="py-12" bodyClassName="grid justify-items-center gap-4 text-center">
                <IconTile tone="orange" className="size-14 rounded-[14px] [&_svg]:size-7">
                  <Check />
                </IconTile>
                <div>
                  <h2 className="text-[1.3rem] font-[700] text-ink">
                    Revisaste los {fmtInt(total)} temas de la semana
                  </h2>
                  <p className="mt-1 text-[0.95rem] text-ink-2">
                    Lo que sirve ya tiene borrador en camino. Nada se publica sin aprobación.
                  </p>
                </div>
                <dl className="grid w-full max-w-md grid-cols-3 gap-2">
                  {[
                    { label: 'Sirven', value: approved.length },
                    { label: 'Para después', value: later },
                    { label: 'No sirven', value: discarded },
                  ].map((k) => (
                    <div key={k.label} className="rounded-[12px] border border-rule px-3 py-3">
                      <dd className="text-[1.6rem] leading-none font-[700] text-ink tabular-nums">
                        {fmtInt(k.value)}
                      </dd>
                      <dt className="mt-1.5 text-[0.8rem] text-ink-2">{k.label}</dt>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap justify-center gap-2">
                  <Link
                    href="/calendario"
                    className="inline-flex h-10 items-center rounded-full bg-marker px-5 text-[0.94rem] font-[650] text-on-marker hover:bg-marker-strong"
                  >
                    Ir al calendario
                  </Link>
                  {later > 0 && (
                    <Button onClick={() => restart('despues')}>
                      Repasar los de después ({fmtInt(later)})
                    </Button>
                  )}
                  <Button icon={<RotateCcw className="size-4" />} onClick={() => restart()}>
                    Volver a empezar
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* ------------------------------------------------ approved */}
          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex-1 rounded-[14px] border border-rule bg-sheet p-5">
              <div className="flex items-center gap-3">
                <IconTile tone="orange" className="size-12 rounded-[12px] [&_svg]:size-5">
                  <FileText />
                </IconTile>
                <div className="min-w-0">
                  <h2 className="text-[1.15rem] font-[700] text-ink">
                    Aprobados
                    {approved.length > 0 && (
                      <span className="ml-1.5 text-ink-3 tabular-nums">{approved.length}</span>
                    )}
                  </h2>
                  <p className="text-[0.88rem] text-ink-2">Pasan a borrador y al calendario</p>
                </div>
              </div>

              {approved.length === 0 ? (
                <p className="mt-4 rounded-[12px] border border-dashed border-rule-strong px-4 py-4 text-[0.95rem] text-ink">
                  Todavía nada. Desliza a la derecha lo que le sirve a tu equipo.
                </p>
              ) : (
                <ul className="mt-4 grid gap-2">
                  {approved.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center gap-3 rounded-[12px] border border-rule px-3 py-2.5"
                    >
                      <span
                        className="size-9 shrink-0 rounded-[9px]"
                        style={skin(t.platforms[0])}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.94rem] font-[700] text-ink">{t.name}</p>
                        <p className="text-[0.8rem] text-ink-2">
                          {t.fit !== null && <>{t.fit}/10 encaje · </>}
                          <Link
                            href={`/tema/${t.id}/contar`}
                            className="font-[600] text-brand hover:underline"
                          >
                            Ver borrador
                          </Link>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => decide(t.id, null)}
                        className="grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink"
                        aria-label={`Deshacer: ${t.name} vuelve a la pila`}
                        title="Deshacer"
                      >
                        <Undo2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(later > 0 || discarded > 0) && (
                <p className="mt-4 text-[0.82rem] text-ink-3">
                  {later > 0 && <>{fmtInt(later)} para después</>}
                  {later > 0 && discarded > 0 && ' · '}
                  {discarded > 0 && (
                    <>
                      {fmtInt(discarded)} {discarded === 1 ? 'no sirve' : 'no sirven'}
                    </>
                  )}
                </p>
              )}
            </section>

            <DarkNote className="items-stretch">
              <ul className="grid gap-2.5">
                <li className="flex items-center gap-3">
                  <HardDrive className="size-4 shrink-0 text-sheet/80" aria-hidden />
                  Tus decisiones se guardan en este navegador.
                </li>
                <li className="flex items-center gap-3">
                  <ShieldCheck className="size-4 shrink-0 text-sheet/80" aria-hidden />
                  Nada se publica sin aprobación.
                </li>
              </ul>
            </DarkNote>
          </div>
        </div>
      )}
    </Page>
  );
}
