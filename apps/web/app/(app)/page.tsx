'use client';

import clsx from 'clsx';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LanguageWaves } from '@/components/language-waves';
import { FitMeter, LangTrio, Sparkline, TimingChip, UnconfirmedChip } from '@/components/marks';
import { Page } from '@/components/shell';
import { Empty, Skeleton, StageTag, fmtDateTime, fmtGrowth, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { windowLine } from '@/lib/language';
import { PLATFORM_COPY, type Radar, type RadarTopic } from '@/lib/types';

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

const usd = (n: number) =>
  `USD ${n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);

function weekLabel(start: string, end: string) {
  const f = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `Semana del ${f.format(new Date(start))} al ${f.format(new Date(end))}`;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex max-w-full min-w-0 gap-1 overflow-x-auto rounded-full bg-fill p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-full px-3.5 py-1.5 text-[0.88rem] font-[620] whitespace-nowrap transition',
            value === o.value ? 'bg-sheet text-ink shadow-sheet' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function WindowRow({ topic, n }: { topic: RadarTopic; n: number }) {
  return (
    <li className="grid gap-x-6 gap-y-3 py-5 md:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] md:items-center">
      <span className="t-figure text-[2rem] leading-none text-marker">{n}</span>
      <div className="min-w-0">
        <Link
          href={`/tema/${topic.id}`}
          className="t-h3 block text-[1.3rem] text-ink hover:text-brand"
        >
          {topic.name}
        </Link>
        <p className="mt-1 text-[0.95rem] text-ink-2">{windowLine(topic)}</p>
        {topic.why && (
          <p className="mt-1 line-clamp-2 text-[0.9rem] leading-snug text-ink-3">{topic.why}</p>
        )}
      </div>
      <LangTrio languages={topic.languages} />
      <Link
        href={`/tema/${topic.id}#contar`}
        className="inline-flex h-10 w-fit items-center rounded-full bg-marker px-4 text-[0.92rem] font-[700] whitespace-nowrap text-on-marker hover:bg-marker-strong"
      >
        Adáptalo al español
      </Link>
    </li>
  );
}

function TopicRow({ topic, markUntouched }: { topic: RadarTopic; markUntouched: boolean }) {
  const where = topic.platforms.slice(0, 3).map((p) => PLATFORM_COPY[p]);
  return (
    <li>
      <Link
        href={`/tema/${topic.id}`}
        className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-4 transition hover:bg-sheet-2 sm:px-5 lg:grid-cols-[2.25rem_minmax(0,2.4fr)_9rem_7rem_6.5rem_8.5rem_11rem_1rem] lg:items-center"
      >
        <span className="t-figure pt-0.5 text-[1.35rem] leading-none text-ink-3 lg:pt-0">
          {topic.rank}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1.04rem] leading-snug font-[700] text-ink">
            {topic.name}
            {!topic.confirmed && <UnconfirmedChip growingIn={topic.growingIn} />}
            {markUntouched && topic.untouched && (topic.fit ?? 0) >= 7 && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[0.72rem] font-[680] text-brand">
                30X no lo ha tocado
              </span>
            )}
          </p>
          {topic.why && (
            <p className="mt-1 line-clamp-2 text-[0.9rem] leading-snug text-ink-2">{topic.why}</p>
          )}
          {where.length > 0 && (
            <p className="mt-1 text-[0.8rem] text-ink-3">Se mueve en {list(where)}.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 lg:hidden">
            <StageTag stage={topic.stage} />
            <span className="t-figure text-[1rem] text-ink">
              {topic.fresh ? 'Nuevo esta semana' : fmtGrowth(topic.growthPct)}
            </span>
            <LangTrio languages={topic.languages} />
          </div>
        </div>
        <ChevronRight className="size-4 text-ink-3 lg:hidden" aria-hidden />
        <div className="hidden lg:block">
          <StageTag stage={topic.stage} />
        </div>
        <div className="hidden lg:block">
          <p className="t-figure text-[1.35rem] leading-none text-ink">
            {topic.fresh ? 'Nuevo' : fmtGrowth(topic.growthPct)}
          </p>
          <p className="mt-1 text-[0.76rem] text-ink-3">{fmtInt(topic.creators)} creadores</p>
        </div>
        <Sparkline values={topic.sparkline} className="hidden lg:block" />
        <LangTrio languages={topic.languages} className="hidden lg:inline-flex" />
        <div className="hidden flex-col items-start gap-1.5 lg:flex">
          <TimingChip timing={topic.timing} />
          <FitMeter fit={topic.fit} />
        </div>
        <ChevronRight
          className="hidden size-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink lg:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}

export default function RadarPage() {
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]['value']>('all');
  const [region, setRegion] = useState<(typeof REGIONS)[number]['value']>('global');
  const [untouched, setUntouched] = useState(false);
  // The brief asks to filter by audience: on by default, one click to see everything.
  const [forAudience, setForAudience] = useState(true);
  const query = new URLSearchParams({
    platform,
    region,
    audience: forAudience ? '30x' : 'all',
    ...(untouched ? { untouched: '1' } : {}),
  });
  const { data, isLoading, error } = useApi<Radar>(`/api/v1/radar?${query}`);

  // The waves show the open windows first, then the fastest topics, six at most.
  const onWaves = data
    ? [...new Map([...data.windowsOpen, ...data.topics].map((t) => [t.id, t])).values()].slice(0, 6)
    : [];
  const numbered = new Map(onWaves.map((t, i) => [t.id, i + 1]));

  return (
    <>
      <section className="noche pb-8">
        <div className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6 sm:pt-10">
          {data ? (
            <>
              <p className="text-[0.95rem] font-[600] text-white/70">
                {weekLabel(data.week.start, data.week.end)}
              </p>
              <h1 className="t-display mt-2 max-w-5xl text-[clamp(1.85rem,1.1rem+2.4vw,3rem)] text-balance text-white">
                {data.headline}
              </h1>
              <p className="mt-3 max-w-3xl text-[0.98rem] text-white/70">
                Medido en {fmtInt(data.basis.pieces)} piezas públicas de{' '}
                {fmtInt(data.basis.creators)} creadores, en {data.basis.sources} fuentes y tres
                idiomas.
                {data.basis.updatedAt && ` Última captura el ${fmtDateTime(data.basis.updatedAt)}`}
              </p>
              <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="min-w-0">
                  <h2 className="t-h3 text-white">La ola viaja de idioma en idioma</h2>
                  <p className="mt-1 max-w-2xl text-[0.92rem] text-white/65">
                    Lo viral sobre IA nace en inglés o portugués y llega días después al español.
                    Cada hilo es un tema; en naranja, los que ya despegaron afuera y en español casi
                    nadie cuenta todavía.
                  </p>
                  <div className="mt-4">
                    <LanguageWaves topics={onWaves} numbered={numbered} />
                  </div>
                </div>
                <ol className="grid content-start gap-1 lg:pt-14">
                  {onWaves.map((t, i) => (
                    <li key={t.id}>
                      <Link
                        href={`/tema/${t.id}`}
                        className="grid grid-cols-[1.6rem_minmax(0,1fr)] items-baseline gap-2 rounded-[12px] px-2 py-1.5 text-white hover:bg-white/10"
                      >
                        <span className="t-figure text-[1.05rem] text-white/60">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[0.98rem] font-[680]">{t.name}</span>
                          <span
                            className={clsx(
                              'text-[0.8rem]',
                              t.spanishWindow.open ? 'font-[650] text-[#ffb08a]' : 'text-white/55',
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
              </div>
            </>
          ) : (
            <div className="grid gap-4 pb-6">
              <div className="h-5 w-56 animate-pulse rounded-full bg-white/10" />
              <div className="h-24 max-w-3xl animate-pulse rounded-[18px] bg-white/10" />
              <div className="h-[320px] animate-pulse rounded-[18px] bg-white/5" />
            </div>
          )}
        </div>
      </section>

      <Page className="grid gap-12">
        {error && (
          <Empty title="No pudimos leer el radar">
            {error instanceof Error ? error.message : 'Intenta de nuevo en unos segundos.'}
          </Empty>
        )}

        {data && data.windowsOpen.length > 0 && (
          <section className="grid gap-2">
            <h2 className="t-h2 text-ink">
              Ya es viral en inglés o portugués, todavía no en español
            </h2>
            <p className="max-w-3xl text-ink-2">
              La ventana para adaptarlo primero: temas con una conversación grande afuera y casi
              nadie contándolos en español esta semana.
            </p>
            <ol className="mt-2 divide-y divide-rule border-y border-rule">
              {data.windowsOpen.map((t, i) => (
                <WindowRow key={t.id} topic={t} n={i + 1} />
              ))}
            </ol>
          </section>
        )}

        <section className="grid gap-4">
          <div>
            <h2 className="t-h2 text-ink">Los 10 temas de IA que más crecen</h2>
            <p className="mt-1 text-ink-2">
              Creadores distintos que hablan del tema esta semana, frente a su promedio de las
              cuatro anteriores.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Segmented label="Red" options={PLATFORMS} value={platform} onChange={setPlatform} />
            <Segmented label="Idioma" options={REGIONS} value={region} onChange={setRegion} />
            <button
              type="button"
              aria-pressed={forAudience}
              onClick={() => setForAudience((v) => !v)}
              className={clsx(
                'rounded-full px-3.5 py-2 text-[0.88rem] font-[620] transition',
                forAudience ? 'bg-brand text-on-brand' : 'bg-fill text-ink-2 hover:text-ink',
              )}
            >
              Le sirve a 30X
            </button>
            <button
              type="button"
              aria-pressed={untouched}
              onClick={() => setUntouched((v) => !v)}
              className={clsx(
                'rounded-full px-3.5 py-2 text-[0.88rem] font-[620] transition',
                untouched ? 'bg-brand text-on-brand' : 'bg-fill text-ink-2 hover:text-ink',
              )}
            >
              Sin explotar por 30X
            </button>
          </div>

          {data && data.topics.length > 0 && data.topics.every((t) => t.untouched) && (
            <p className="text-[0.9rem] text-ink-2">
              30X y Andrés Bilbao todavía no han publicado sobre ninguno de estos temas: todos son
              una oportunidad de llegar primero.
            </p>
          )}
          {data && forAudience && data.hiddenByAudience > 0 && (
            <p className="text-[0.9rem] text-ink-2">
              {data.hiddenByAudience === 1
                ? 'Un tema que crece no le sirve a la audiencia de 30X y quedó fuera.'
                : `${data.hiddenByAudience} temas que crecen no le sirven a la audiencia de 30X y quedaron fuera.`}{' '}
              <button
                type="button"
                onClick={() => setForAudience(false)}
                className="font-[650] text-brand hover:underline"
              >
                Ver todos
              </button>
            </p>
          )}
          {isLoading && !data && <Skeleton className="h-[560px]" />}
          {data && data.topics.length === 0 && (
            <Empty title="Nada crece con este filtro">
              Prueba con todas las redes, o quita «Le sirve a 30X» o «Sin explotar por 30X».
            </Empty>
          )}
          {data && data.topics.length > 0 && (
            <div className="sheet overflow-hidden">
              <div className="hidden grid-cols-[2.25rem_minmax(0,2.4fr)_9rem_7rem_6.5rem_8.5rem_11rem_1rem] gap-x-3 border-b border-rule px-5 py-2.5 text-[0.8rem] font-[600] text-ink-3 lg:grid">
                <span />
                <span>Tema y por qué crece</span>
                <span>Etapa</span>
                <span>Crecimiento</span>
                <span>8 semanas</span>
                <span>Inglés, portugués, español</span>
                <span>Momento y encaje</span>
                <span />
              </div>
              <ol className="divide-y divide-rule">
                {data.topics.map((t) => (
                  <TopicRow
                    key={t.id}
                    topic={t}
                    markUntouched={data.topics.some((x) => !x.untouched)}
                  />
                ))}
              </ol>
            </div>
          )}
        </section>

        {data && data.forming.length > 0 && (
          <section className="grid gap-2">
            <h2 className="t-h2 text-ink">Se está formando</h2>
            <p className="max-w-3xl text-ink-2">
              Suben donde las olas de IA nacen (GitHub, Hacker News, Hugging Face, X) y todavía no
              llegan a LinkedIn ni a Instagram.
            </p>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {data.forming.map((t) => (
                <li key={t.id} className="border-t border-rule py-3">
                  <Link href={`/tema/${t.id}`} className="group block">
                    <p className="font-[700] text-ink group-hover:text-brand">{t.name}</p>
                    <p className="mt-0.5 text-sm text-ink-2">
                      {t.fresh
                        ? 'Apareció esta semana'
                        : `${fmtGrowth(t.growthPct)} frente a su promedio`}
                      , {fmtInt(t.creators)} creadores.
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data && (
          <p className="border-t border-rule pt-5 text-[0.92rem] text-ink-2">
            Esta semana el radar costó{' '}
            <span className="font-[700] text-ink">{usd(data.cost.weekUsd)}</span>:{' '}
            {usd(data.cost.llmUsd)} de modelo y {usd(data.cost.dataUsd)} de datos. Una suite de
            social listening cuesta entre USD 19.000 y 50.000 al año.{' '}
            <Link href="/evaluacion" className="font-[600] text-brand hover:underline">
              Cómo lo medimos
            </Link>
          </p>
        )}
      </Page>
    </>
  );
}
