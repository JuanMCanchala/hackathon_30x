'use client';

import clsx from 'clsx';
import {
  ArrowRight,
  CalendarDays,
  DoorOpen,
  Download,
  Globe,
  ListChecks,
  Loader,
  Share,
  SquareCheck,
  TrendingUp,
  Waves,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Card, Kpi, LangBoxes, Pill, StageChip, table, type Tone } from '@/components/kit';
import { LanguageWaves } from '@/components/language-waves';
import { Sparkline, UnconfirmedChip } from '@/components/marks';
import { RadarOnda } from '@/components/radar-onda';
import { Page } from '@/components/shell';
import { Empty, Skeleton, fmtGrowth, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import {
  LANG_SHORT,
  PLATFORM_COPY,
  type CalendarEntry,
  type Platform,
  type Radar,
  type RadarTopic,
} from '@/lib/types';
import { useDecisions } from '@/lib/workspace';

const PLATFORMS = [
  { value: 'all', label: 'Todas las redes' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
] as const;

const REGIONS = [
  { value: 'global', label: 'Todos los idiomas' },
  { value: 'latam', label: 'Solo español' },
] as const;

/** The radar as the API sends it: `coverage` explains why one network fills fewer than 10. */
type RadarData = Radar & {
  coverage?: { platform: Platform; pieces: number; reason: string } | null;
};

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
];

const usd = (n: number) =>
  `USD ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);

/** «Semana 11–18 oct», or «Semana 28 sept–4 oct» across months. */
function weekLabel(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(end);
  const [da, ma, db, mb] = [a.getUTCDate(), a.getUTCMonth(), b.getUTCDate(), b.getUTCMonth()];
  return ma === mb
    ? `Semana ${da}–${db} ${MONTHS[mb]}`
    : `Semana ${da} ${MONTHS[ma]}–${db} ${MONTHS[mb]}`;
}

/** «23 días de ventaja», or «más de 49» while Spanish has not stood out yet. */
function leadDays(t: RadarTopic): string | null {
  const w = t.spanishWindow;
  if (!w.lagDays) return null;
  return `${w.reached === false ? 'más de ' : ''}${fmtInt(w.lagDays)} días de ventaja`;
}

const TILE_TONES = [
  'bg-[color-mix(in_oklab,var(--marker)_14%,var(--sheet))] text-marker-strong',
  'bg-lavender-tint text-brand-strong',
  'bg-st-emergente-tint text-st-emergente',
  'bg-st-saturado-tint text-st-saturado',
  'bg-fill text-ink',
];
const SMALL_WORDS = new Set(['y', 'de', 'del', 'en', 'la', 'el', 'las', 'los', 'con', 'para', 'a']);

/** Two letters for a topic's tile: «Android y IA» → «AI». */
function initials(name: string) {
  const words = name.split(/\s+/).filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)).toUpperCase();
}

/** The same topic always gets the same tint. */
function toneOf(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE_TONES[h % TILE_TONES.length]!;
}

/** A small tinted square with the topic's initials, in place of a photo. */
function TopicTile({ topic }: { topic: RadarTopic }) {
  return (
    <span
      className={clsx(
        'grid size-10 shrink-0 place-items-center rounded-[9px] text-[0.82rem] font-[750] tracking-[0.02em]',
        toneOf(topic.id),
      )}
      aria-hidden
    >
      {initials(topic.name)}
    </span>
  );
}

/** An outlined chip that leads to a topic. */
function TopicChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex max-w-full items-center rounded-[8px] border border-rule-strong bg-sheet px-3 py-1.5 text-[0.88rem] text-ink transition hover:border-ink hover:bg-sheet-2"
    >
      <span className="truncate">{children}</span>
    </Link>
  );
}

/** «Ciclo de vida / Por idioma»: which view of the week's wave to draw. */
function ViewToggle({
  value,
  onChange,
}: {
  value: 'ciclo' | 'idioma';
  onChange: (v: 'ciclo' | 'idioma') => void;
}) {
  const options = [
    { value: 'ciclo', label: 'Ciclo de vida', short: 'Ciclo' },
    { value: 'idioma', label: 'Por idioma', short: 'Idioma' },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label="Vista"
      className="flex shrink-0 gap-0.5 rounded-[10px] border border-rule bg-sheet-2 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-[8px] px-2.5 py-2 text-[0.78rem] whitespace-nowrap transition sm:px-3 lg:py-1',
            value === o.value
              ? 'bg-sheet font-[700] text-ink shadow-[0_1px_2px_rgb(32_21_21/0.08)]'
              : 'font-[600] text-ink-2 hover:text-ink',
          )}
        >
          <span className="hidden sm:inline">{o.label}</span>
          <span className="sm:hidden">{o.short}</span>
        </button>
      ))}
    </div>
  );
}

/** Below xl a row stacks into a small card, so its cells drop the table's padding and rules. */
const td = clsx(table.td, 'max-xl:border-0 max-xl:p-0');

/** One row of «Los temas que más crecen»: the whole row opens the topic. */
function TopicRow({ topic, markUntouched }: { topic: RadarTopic; markUntouched: boolean }) {
  const router = useRouter();
  const where = topic.platforms.slice(0, 2).map((p) => PLATFORM_COPY[p]);
  const now = topic.timing === 'Entra ya';
  return (
    <tr
      className="group cursor-pointer transition hover:bg-sheet-2 max-xl:grid max-xl:grid-cols-[1.5rem_minmax(0,1fr)_auto] max-xl:items-center max-xl:gap-x-3 max-xl:gap-y-2 max-xl:border-b max-xl:border-rule max-xl:py-3.5"
      onClick={() => router.push(`/tema/${topic.id}`)}
    >
      <td className={clsx(td, 'text-ink-2 tabular-nums xl:w-10')}>{topic.rank}</td>
      <td className={clsx(td, 'max-xl:col-span-2 xl:min-w-[240px] min-[1440px]:min-w-[300px]')}>
        <div className="flex items-center gap-3">
          <TopicTile topic={topic} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/tema/${topic.id}`}
                className="font-[700] text-ink group-hover:text-brand"
                onClick={(e) => e.stopPropagation()}
              >
                {topic.name}
              </Link>
              {!topic.confirmed && <UnconfirmedChip growingIn={topic.growingIn} />}
              {markUntouched && topic.untouched && (topic.fit ?? 0) >= 7 && (
                <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[0.72rem] font-[680] text-brand">
                  30X no lo ha tocado
                </span>
              )}
            </p>
            {topic.why && (
              <p className="mt-0.5 line-clamp-1 max-w-[340px] text-[0.8rem] text-ink-2">
                {topic.why}
              </p>
            )}
          </div>
        </div>
      </td>
      <td
        className={clsx(
          td,
          'max-xl:col-start-2 max-xl:row-start-2 max-xl:flex max-xl:flex-wrap max-xl:items-baseline max-xl:gap-x-2',
        )}
      >
        <p
          className={clsx(
            'font-[650] tabular-nums',
            topic.fresh || topic.growthPct >= 0 ? 'text-st-emergente' : 'text-held',
          )}
        >
          {topic.fresh ? 'Nuevo' : fmtGrowth(topic.growthPct)}
        </p>
        <p className="text-[0.84rem] whitespace-nowrap text-ink-2">
          {fmtInt(topic.creators)} creadores
        </p>
      </td>
      <td className={clsx(td, 'max-[1440px]:hidden')}>
        <Sparkline
          values={topic.sparkline}
          width={100}
          className={topic.growthPct >= 0 ? 'text-st-emergente' : 'text-held'}
        />
      </td>
      <td className={clsx(td, 'max-xl:col-start-2 max-xl:row-start-4 xl:whitespace-nowrap')}>
        {list(where)}
      </td>
      <td
        className={clsx(
          td,
          'max-xl:col-span-2 max-xl:col-start-2 max-xl:row-start-3 max-xl:flex max-xl:flex-wrap max-xl:items-center max-xl:gap-x-2 max-xl:gap-y-1',
        )}
      >
        <StageChip stage={topic.stage} />
        <p
          className={clsx(
            'text-[0.86rem] font-[650] whitespace-nowrap xl:mt-1',
            now ? 'text-marker-strong' : 'text-ink',
          )}
        >
          {topic.timing}
        </p>
      </td>
      <td
        className={clsx(
          td,
          'text-[1.05rem] font-[700] whitespace-nowrap tabular-nums max-xl:col-start-3 max-xl:row-start-2 max-xl:text-right',
        )}
      >
        <span className="mr-1.5 text-[0.75rem] font-[600] text-ink-3 xl:hidden">Encaje</span>
        {topic.fit != null ? `${topic.fit}/10` : '—'}
      </td>
      <td className={clsx(td, 'max-xl:col-start-3 max-xl:row-start-4')}>
        <LangBoxes languages={topic.languages} />
      </td>
    </tr>
  );
}

const ICON_TONE: Record<string, Tone> = {
  signal: 'orange',
  window: 'lavender',
  pending: 'sand',
  approved: 'green',
};

/** The query string is read on the client only, so the page waits for it in a Suspense boundary. */
export default function RadarRoute() {
  return (
    <Suspense>
      <RadarPage />
    </Suspense>
  );
}

function RadarPage() {
  const params = useSearchParams();
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]['value']>('all');
  const [region, setRegion] = useState<(typeof REGIONS)[number]['value']>('global');
  // Referentes links here with ?untouched=1: «temas que crecen y 30X no ha tocado».
  const [untouched, setUntouched] = useState(() => params.get('untouched') === '1');
  // The brief asks to filter by audience: on by default, one click to see everything.
  const [forAudience, setForAudience] = useState(true);
  const [view, setView] = useState<'ciclo' | 'idioma'>('ciclo');
  const [decisions] = useDecisions();

  // The week as a whole (headline, figures, the wave) reads the radar unfiltered, like the sidebar;
  // the filters only narrow the table.
  const base = useApi<RadarData>('/api/v1/radar');
  const filtered = platform !== 'all' || region !== 'global' || untouched || !forAudience;
  const query = new URLSearchParams({
    platform,
    region,
    audience: forAudience ? '30x' : 'all',
    ...(untouched ? { untouched: '1' } : {}),
  });
  const ranked = useApi<RadarData>(filtered ? `/api/v1/radar?${query}` : '/api/v1/radar');
  const { data: calendar } = useApi<CalendarEntry[]>('/api/v1/calendar');

  const data = base.data;
  const rows = ranked.data;
  const pending = data ? data.topics.filter((t) => !decisions[t.id]).length : 0;
  const widest = data?.windowsOpen.reduce<RadarTopic | null>(
    (best, t) => ((t.spanishWindow.lagDays ?? 0) > (best?.spanishWindow.lagDays ?? 0) ? t : best),
    null,
  );

  // The language view draws the open windows first, then the fastest topics, six at most.
  const onWaves = data
    ? [...new Map([...data.windowsOpen, ...data.topics].map((t) => [t.id, t])).values()].slice(0, 6)
    : [];
  const numbered = new Map(onWaves.map((t, i) => [t.id, i + 1]));
  const formingWhere = data
    ? [...new Set(data.forming.flatMap((t) => t.growingIn))].map((p) => PLATFORM_COPY[p])
    : [];

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Enlace copiado', { description: 'Pégalo donde quieras compartir el radar.' });
    } catch {
      toast.error('No se pudo copiar el enlace.');
    }
  }

  if (base.error) {
    return (
      <Page>
        <Empty title="No pudimos leer el radar">
          {base.error instanceof Error ? base.error.message : 'Intenta de nuevo en unos segundos.'}
        </Empty>
      </Page>
    );
  }

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* 1. head */}
      <header className="flex flex-wrap items-start justify-between gap-4 lg:flex-nowrap">
        <div className="max-w-4xl min-w-0 flex-1 max-md:basis-full">
          <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1.5 text-[0.84rem]">
            <Link href="/radar" className="text-brand hover:underline">
              Radar
            </Link>
            <span className="text-ink-3" aria-hidden>
              ›
            </span>
            {data ? (
              <span className="text-ink-2">
                {weekLabel(data.week.start, data.week.end)} · {fmtInt(data.basis.pieces)} piezas ·{' '}
                {fmtInt(data.basis.creators)} creadores · {data.basis.sources} fuentes
              </span>
            ) : (
              <span className="h-4 w-64 animate-pulse rounded-full bg-fill" />
            )}
          </nav>
          <p className="mt-2 text-[0.84rem] font-[650] text-marker-strong">Titular de la semana</p>
          {data ? (
            <h1 className="mt-0.5 text-[1.625rem] leading-tight font-[700] tracking-[-0.02em] text-ink">
              {data.headline}
            </h1>
          ) : (
            <div className="mt-1 h-8 w-[min(36rem,100%)] animate-pulse rounded-[10px] bg-fill" />
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={share}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.9rem] font-[600] text-ink transition hover:bg-sheet-2"
          >
            <Share className="size-4" aria-hidden />
            Compartir
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-[0.9rem] font-[600] text-sheet transition hover:opacity-90"
          >
            <Download className="size-4" aria-hidden />
            Exportar informe
          </button>
        </div>
      </header>

      {/* 2. figures */}
      {data ? (
        <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
          <Kpi
            label="Temas con señal"
            value={fmtInt(data.topics.length)}
            note={data.forming.length > 0 ? `+${data.forming.length} formándose` : undefined}
            noteTone="good"
            icon={<TrendingUp />}
            tone={ICON_TONE.signal}
          />
          <Kpi
            label="Ventana abierta en ES"
            value={fmtInt(data.windowsOpen.length)}
            note={
              widest?.spanishWindow.leader && widest.spanishWindow.lagDays
                ? `${LANG_SHORT[widest.spanishWindow.leader]} lleva ${leadDays(widest)}`
                : undefined
            }
            icon={<Globe />}
            tone={ICON_TONE.window}
          />
          <Kpi
            label="Por revisar"
            value={fmtInt(pending)}
            note="en Elegir"
            icon={<SquareCheck />}
            tone={ICON_TONE.pending}
            href="/elegir"
          />
          <Kpi
            label="Aprobados"
            value={calendar ? fmtInt(calendar.length) : '—'}
            note="en el calendario"
            icon={<CalendarDays />}
            tone={ICON_TONE.approved}
            href="/calendario"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px]" />
          ))}
        </div>
      )}

      {/* 3. Elegir */}
      <section className="rounded-[16px] border border-[color-mix(in_oklab,var(--marker)_24%,var(--rule))] bg-[linear-gradient(100deg,color-mix(in_oklab,var(--marker)_4%,var(--sheet))_15%,color-mix(in_oklab,var(--marker)_34%,var(--sheet)))] px-5 py-6 sm:px-7 sm:py-8 print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-marker text-on-marker"
            aria-hidden
          >
            <ListChecks className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[0.72rem] tracking-[0.14em] text-marker-strong uppercase">
              Elegir · {pending > 0 ? `${pending} por revisar` : 'todo revisado'}
            </p>
            <h2 className="mt-1 text-[1.45rem] leading-tight font-[700] tracking-[-0.02em] text-ink sm:text-[1.6rem]">
              Desliza las ondas de la semana
            </h2>
            <p className="mt-1 text-[0.95rem] text-ink-2">
              Desliza los que le sirven a tu equipo. Lo que apruebas pasa a borrador.
            </p>
          </div>
          <Link
            href="/elegir"
            className="inline-flex h-11 w-fit shrink-0 items-center gap-2 rounded-[10px] bg-marker px-4 text-[0.95rem] font-[700] text-on-marker transition hover:bg-marker-strong"
          >
            Empezar a elegir <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* 4. La onda */}
      <Card
        icon={<Waves />}
        tone="orange"
        title="La onda"
        action={<ViewToggle value={view} onChange={setView} />}
      >
        <p className="-mt-2 mb-4 text-[0.88rem] text-ink-2 sm:pl-[42px]">
          {view === 'ciclo'
            ? 'Dónde está cada tema en su ciclo de vida · los 6 que más crecen'
            : 'Cómo viaja cada tema del inglés y el portugués al español'}
        </p>
        {!data ? (
          <Skeleton className="h-[300px]" />
        ) : data.topics.length === 0 ? (
          <p className="py-10 text-center text-ink-2">Esta semana no hay temas con señal.</p>
        ) : view === 'ciclo' ? (
          <RadarOnda topics={data.topics.slice(0, 6)} />
        ) : (
          <>
            <LanguageWaves topics={onWaves} numbered={numbered} />
            <ol className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
              {onWaves.map((t, i) => (
                <li key={t.id}>
                  <Link
                    href={`/tema/${t.id}`}
                    className="grid grid-cols-[1.4rem_minmax(0,1fr)] items-baseline gap-2 rounded-[8px] px-2 py-1 hover:bg-sheet-2"
                  >
                    <span className="text-[0.85rem] font-[700] text-ink-3 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[0.9rem] font-[650] text-ink">
                        {t.name}
                      </span>
                      <span
                        className={clsx(
                          'text-[0.78rem]',
                          t.spanishWindow.open ? 'font-[650] text-marker-strong' : 'text-ink-3',
                        )}
                      >
                        {t.spanishWindow.open
                          ? 'Ventana abierta en español'
                          : `${fmtGrowth(t.growthPct)} esta semana`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>

      {/* 5. windows and what is forming */}
      {data && (data.windowsOpen.length > 0 || data.forming.length > 0) && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
          <Card icon={<DoorOpen />} tone="orange" title="Ventana abierta en español">
            <p className="text-[0.95rem] text-ink-2">
              Ya despegaron en inglés o portugués y casi nadie lo cuenta en español.
            </p>
            {data.windowsOpen.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.windowsOpen.map((t) => {
                  const w = t.spanishWindow;
                  const days = leadDays(t);
                  return (
                    <TopicChip key={t.id} href={`/tema/${t.id}/contar`}>
                      {t.name}
                      {w.leader && ` · ${LANG_SHORT[w.leader]} lidera`}
                      {days && ` · ${days}`}
                    </TopicChip>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-[0.9rem] text-ink-3">Esta semana no hay ventanas abiertas.</p>
            )}
          </Card>
          <Card icon={<Loader />} tone="lavender" title="Se está formando">
            <p className="text-[0.95rem] text-ink-2">
              {formingWhere.length > 0
                ? `Suben en ${list(formingWhere)}; aún no llegan a LinkedIn ni Instagram.`
                : 'Suben donde las olas de IA nacen y aún no llegan a LinkedIn ni Instagram.'}
            </p>
            {data.forming.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {data.forming.map((t) => {
                  const where = (t.growingIn.length ? t.growingIn : t.platforms).slice(0, 2);
                  return (
                    <TopicChip key={t.id} href={`/tema/${t.id}`}>
                      {t.name}
                      {where.length > 0 && ` · ${where.map((p) => PLATFORM_COPY[p]).join(', ')}`}
                    </TopicChip>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-[0.9rem] text-ink-3">Nada se está formando esta semana.</p>
            )}
          </Card>
        </div>
      )}

      {/* 6. the table */}
      <Card icon={<TrendingUp />} tone="sand" title="Los temas que más crecen">
        <div className="flex flex-wrap items-center gap-1.5 print:hidden">
          {PLATFORMS.map((p) => (
            <Pill key={p.value} on={platform === p.value} onClick={() => setPlatform(p.value)}>
              {p.label}
            </Pill>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-rule sm:block" aria-hidden />
          {REGIONS.map((r) => (
            <Pill key={r.value} on={region === r.value} onClick={() => setRegion(r.value)}>
              {r.label}
            </Pill>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-rule sm:block" aria-hidden />
          <Pill on={forAudience} onClick={() => setForAudience((v) => !v)}>
            Le sirve a 30X
          </Pill>
          <Pill on={untouched} onClick={() => setUntouched((v) => !v)}>
            Sin explotar por 30X
          </Pill>
        </div>

        <div className="mt-3 grid gap-1 text-[0.86rem] text-ink-2 empty:hidden">
          {rows && rows.topics.length > 0 && rows.topics.every((t) => t.untouched) && (
            <p>
              30X y Andrés Bilbao todavía no han publicado sobre ninguno de estos temas: todos son
              una oportunidad de llegar primero.
            </p>
          )}
          {rows && forAudience && rows.hiddenByAudience > 0 && (
            <p>
              {rows.hiddenByAudience === 1
                ? 'Un tema que crece no le sirve a la audiencia de 30X y quedó fuera.'
                : `${rows.hiddenByAudience} temas que crecen no le sirven a la audiencia de 30X y quedaron fuera.`}{' '}
              <button
                type="button"
                onClick={() => setForAudience(false)}
                className="font-[650] text-brand hover:underline"
              >
                Ver todos
              </button>
            </p>
          )}
          {rows?.coverage && <p>{rows.coverage.reason}</p>}
        </div>

        <div className="mt-3">
          {ranked.error && (
            <Empty title="No pudimos leer este filtro">
              {ranked.error instanceof Error ? ranked.error.message : 'Intenta de nuevo.'}
            </Empty>
          )}
          {!rows && !ranked.error && <Skeleton className="h-[480px]" />}
          {rows && rows.topics.length === 0 && (
            <Empty title="Nada crece con este filtro">
              Prueba con todas las redes, o quita «Le sirve a 30X» o «Sin explotar por 30X».
            </Empty>
          )}
          {rows && rows.topics.length > 0 && (
            <div className={clsx(table.wrap, ranked.isLoading && 'opacity-60')}>
              <table className={clsx(table.table, 'max-xl:block')}>
                <thead className="max-xl:hidden">
                  <tr>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>#</th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>Tema</th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>Crecimiento</th>
                    <th className={clsx(table.th, 'whitespace-nowrap max-[1440px]:hidden')}>
                      Curva 8 sem.
                    </th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>Dónde se mueve</th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>Etapa · momento</th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>Encaje</th>
                    <th className={clsx(table.th, 'whitespace-nowrap')}>EN · PT · ES</th>
                  </tr>
                </thead>
                <tbody className="max-xl:block">
                  {rows.topics.map((t) => (
                    <TopicRow
                      key={t.id}
                      topic={t}
                      markUntouched={rows.topics.some((x) => !x.untouched)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && rows.topics.length > 0 && (
            <p className="px-3 pt-4 text-[0.86rem] text-ink-2">
              Mostrando {rows.topics.length === 1 ? 'un tema' : `${rows.topics.length} temas`}
            </p>
          )}
        </div>
      </Card>

      {/* 7. what the week cost */}
      {data && (
        <p className="pt-1 text-[0.8rem] text-ink-3">
          Esta semana el radar costó{' '}
          <span className="font-[650] text-ink-2">{usd(data.cost.weekUsd)}</span>:{' '}
          {usd(data.cost.llmUsd)} de modelo y {usd(data.cost.dataUsd)} de datos. Una suite de social
          listening cuesta entre USD 19.000 y 50.000 al año.{' '}
          <Link href="/evaluacion" className="font-[600] text-brand hover:underline">
            Cómo lo medimos
          </Link>
        </p>
      )}
    </Page>
  );
}
