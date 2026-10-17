'use client';

import clsx from 'clsx';
import { ChevronRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Page } from '@/components/shell';
import {
  FitMeter,
  PlatformChips,
  Sparkline,
  TimingChip,
  UnconfirmedChip,
} from '@/components/marks';
import { Empty, Skeleton, StageTag, fmtDateTime, fmtGrowth, fmtInt } from '@/components/ui';
import { WaveChart } from '@/components/wave';
import { useApi } from '@/lib/hooks';
import type { Radar, RadarTopic } from '@/lib/types';

const PLATFORMS = [
  { value: 'all', label: 'Todas las redes' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
] as const;

const REGIONS = [
  { value: 'global', label: 'Global' },
  { value: 'latam', label: 'En español' },
] as const;

const usd = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);

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
      className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-fill p-1"
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

function TopicRow({ topic }: { topic: RadarTopic }) {
  return (
    <li>
      <Link
        href={`/tema/${topic.id}`}
        className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-4 transition hover:bg-sheet-2 sm:px-5 lg:grid-cols-[2.25rem_minmax(0,2.4fr)_9rem_7.5rem_6.5rem_minmax(0,1.1fr)_11.5rem_1rem] lg:items-center"
      >
        <span className="t-figure pt-0.5 text-[1.35rem] leading-none text-ink-3 lg:pt-0">
          {topic.rank}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1.04rem] leading-snug font-[700] text-ink">
            {topic.name}
            {!topic.confirmed && <UnconfirmedChip growingIn={topic.growingIn} />}
            {topic.untouched && (topic.fit ?? 0) >= 7 && (
              <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[0.72rem] font-[680] text-brand">
                Oportunidad: 30X no lo ha tocado
              </span>
            )}
          </p>
          {topic.why && (
            <p className="mt-1 line-clamp-2 text-[0.9rem] leading-snug text-ink-2">{topic.why}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 lg:hidden">
            <StageTag stage={topic.stage} />
            <span className="t-figure text-[1rem] text-ink">
              {topic.fresh ? 'Nuevo esta semana' : fmtGrowth(topic.growthPct)}
            </span>
            <TimingChip timing={topic.timing} />
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
        <div className="hidden lg:block">
          <PlatformChips platforms={topic.platforms} max={3} />
        </div>
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

  return (
    <>
      <section className="noche pb-6">
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
                {fmtInt(data.basis.creators)} creadores, en {data.basis.sources} fuentes.
                {data.basis.updatedAt && ` Última captura el ${fmtDateTime(data.basis.updatedAt)}`}
              </p>
              <div className="mt-6">
                <WaveChart topics={data.topics} />
              </div>
            </>
          ) : (
            <div className="grid gap-4 pb-6">
              <div className="h-5 w-56 animate-pulse rounded-full bg-white/10" />
              <div className="h-24 max-w-3xl animate-pulse rounded-[18px] bg-white/10" />
              <div className="h-[260px] animate-pulse rounded-[18px] bg-white/5" />
            </div>
          )}
        </div>
      </section>

      <Page className="grid gap-10">
        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="t-h2 text-ink">Los 10 temas de IA que más crecen</h2>
              <p className="mt-1 text-ink-2">
                Creadores distintos que hablan del tema esta semana, frente a su promedio de las
                cuatro anteriores.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

          {error && (
            <Empty title="No pudimos leer el radar">
              {error instanceof Error ? error.message : 'Intenta de nuevo en unos segundos.'}
            </Empty>
          )}
          {isLoading && !data && <Skeleton className="h-[560px]" />}
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
          {data && data.topics.length === 0 && (
            <Empty title="Nada crece con este filtro">
              Prueba con todas las redes, o quita «Le sirve a 30X» o «Sin explotar por 30X».
            </Empty>
          )}
          {data && data.topics.length > 0 && (
            <div className="sheet overflow-hidden">
              <div className="hidden grid-cols-[2.25rem_minmax(0,2.4fr)_9rem_7.5rem_6.5rem_minmax(0,1.1fr)_11.5rem_1rem] gap-x-3 border-b border-rule px-5 py-2.5 text-[0.8rem] font-[600] text-ink-3 lg:grid">
                <span />
                <span>Tema y por qué crece</span>
                <span>Etapa</span>
                <span>Crecimiento</span>
                <span>8 semanas</span>
                <span>Dónde se mueve</span>
                <span>Momento y encaje</span>
                <span />
              </div>
              <ol className="divide-y divide-rule">
                {data.topics.map((t) => (
                  <TopicRow key={t.id} topic={t} />
                ))}
              </ol>
            </div>
          )}
        </section>

        {data && data.forming.length > 0 && (
          <section className="grid gap-4">
            <div>
              <h2 className="t-h2 flex items-center gap-2 text-ink">
                <Sparkles className="size-5 text-brand" aria-hidden /> Se está formando
              </h2>
              <p className="mt-1 max-w-3xl text-ink-2">
                Suben donde las olas de IA nacen (GitHub, Hacker News, Hugging Face, X) y todavía no
                llegan a LinkedIn ni a Instagram. Llegar primero aquí es la ventaja.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.forming.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tema/${t.id}`}
                    className="sheet block h-full p-4 transition hover:-translate-y-0.5"
                  >
                    <p className="font-[700] text-ink">{t.name}</p>
                    <p className="mt-1 text-sm text-ink-2">
                      {t.fresh
                        ? 'Apareció esta semana'
                        : `${fmtGrowth(t.growthPct)} frente a su promedio`}
                      , {fmtInt(t.creators)} creadores.
                    </p>
                    <div className="mt-2.5">
                      <PlatformChips platforms={t.platforms} max={3} />
                    </div>
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
