'use client';

import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Globe,
  Lightbulb,
  ListFilter,
  Megaphone,
  Newspaper,
  Target,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, IconTile, MomentChip, StageChip, table } from '@/components/kit';
import { UnconfirmedChip } from '@/components/marks';
import { PieceCard } from '@/components/piece-card';
import { Page } from '@/components/shell';
import { HistoryArea, LangWeekChart, fmtRatio, pieceMetrics } from '@/components/tema-kit';
import { Empty, Skeleton, fmtGrowth, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { languageStory } from '@/lib/language';
import {
  LANGS,
  LANG_COPY,
  LANG_SHORT,
  PLATFORM_COPY,
  type Lang,
  type RadarTopic,
  type TopicDetail,
  type TopicFit,
  type WhyPattern,
} from '@/lib/types';

const TINTS = [
  'bg-[#ffe9dd] text-marker-strong',
  'bg-lavender-tint text-brand-strong',
  'bg-st-emergente-tint text-st-emergente',
];

/** «MC» for Model Context Protocol: the topic's initials on a tint, in place of a photo. */
function TopicTile({ id, name }: { id: string; name: string }) {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [name];
  const initials = words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  const tint = TINTS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];
  return (
    <span
      className={clsx(
        'grid size-[64px] shrink-0 place-items-center rounded-[14px] text-[1.5rem] font-[750] tracking-[-0.02em] sm:size-[76px] sm:text-[1.75rem]',
        tint,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** «hace 6 días», from an ISO date. */
function ago(iso: string): string {
  const days = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'hoy';
  if (days === 1) return 'ayer';
  return `hace ${days} días`;
}

/** «Por qué crece»: the one-line reason, and the news that set it off. */
function WhyCard({ topic, trigger }: { topic: RadarTopic; trigger: TopicDetail['trigger'] }) {
  return (
    <Card icon={<Lightbulb />} tone="orange" title="Por qué crece" className="h-full">
      {topic.why ? (
        <p className="text-[1.05rem] leading-[1.55] text-ink">{topic.why}</p>
      ) : (
        <p className="text-ink-3">Sin explicación todavía.</p>
      )}
      {trigger && (
        <p className="mt-4 text-[0.86rem] leading-snug text-ink-2">
          <Newspaper className="mr-1 inline size-3.5 align-[-2px] text-ink-3" aria-hidden />
          Lo disparó:{' '}
          <a
            href={trigger.url}
            target="_blank"
            rel="noreferrer"
            className="text-ink underline decoration-rule-strong underline-offset-2 hover:text-brand"
          >
            {trigger.title}
          </a>{' '}
          · {trigger.source} · {ago(trigger.date)}
        </p>
      )}
    </Card>
  );
}

function FitBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,9.5rem)_1fr_1.5rem] items-center gap-3 text-[0.88rem]">
      <span className="text-ink-2">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
        <span
          className="block h-full rounded-full bg-ink"
          style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }}
        />
      </span>
      <span className="text-right font-[700] text-ink tabular-nums">{value}</span>
    </div>
  );
}

/** «Encaje con 30X»: the score out of ten and the three things it weighs. */
function FitCard({ fit }: { fit: TopicFit | null }) {
  return (
    <Card icon={<Target />} tone="sand" title="Encaje con 30X" className="h-full">
      {fit ? (
        <div className="grid gap-3">
          <p className="text-[2.6rem] leading-none font-[700] tracking-[-0.03em] text-ink tabular-nums">
            {fit.score}/10
          </p>
          <div className="grid gap-2" aria-label="Encaje por criterio, de 0 a 10">
            <FitBar label="Relevancia ejecutiva" value={fit.executive} />
            <FitBar label="Sin programar" value={fit.noCode} />
            <FitBar label="Ángulo LatAm" value={fit.latam} />
          </div>
          <p className="text-[0.8rem] text-ink-2">
            Pilar: <span className="font-[650] text-ink">{fit.pillar}</span> · Riesgo de humo:{' '}
            <span className="font-[650] text-ink">{fit.hypeRisk}</span>
          </p>
          {fit.reasons.length > 0 && (
            <ul className="grid list-disc gap-0.5 pl-4 text-[0.8rem] text-ink-3">
              {fit.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-ink-3">El encaje se mide cuando el modelo está disponible.</p>
      )}
    </Card>
  );
}

const LANG_BAR: Record<Lang, string> = { en: 'bg-lang-en', pt: 'bg-lang-pt', es: 'bg-lang-es' };

/** «La onda por idioma»: creators this week in each language on one scale, and what it means. */
function LangCard({ topic }: { topic: RadarTopic }) {
  const max = Math.max(1, ...LANGS.map((l) => topic.languages[l].creators));
  return (
    <Card icon={<Globe />} tone="lavender" title="La onda por idioma" className="h-full">
      <ul className="grid gap-2.5">
        {LANGS.map((l) => {
          const w = topic.languages[l];
          return (
            <li
              key={l}
              className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 text-[0.84rem]"
              title={`${LANG_COPY[l]}: ${fmtInt(w.creators)} creadores esta semana`}
            >
              <span className="font-[700] text-ink">{LANG_SHORT[l]}</span>
              <span className="h-1.5 rounded-full bg-fill" aria-hidden>
                <span
                  className={clsx('block h-full rounded-full', LANG_BAR[l])}
                  style={{
                    width: w.creators ? `${(w.creators / max) * 100}%` : '6px',
                  }}
                />
              </span>
              <span className="min-w-[5.5rem] text-right text-ink-2 tabular-nums">
                {w.creators ? (
                  <>
                    <span className="font-[650] text-ink">{fmtInt(w.creators)}</span>
                    {w.growthPct > 0 && ` · ↑${fmtGrowth(w.growthPct).slice(1)}`}
                  </>
                ) : (
                  'aún no'
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[0.9rem] leading-relaxed text-ink">{languageStory(topic)}</p>
    </Card>
  );
}

/** «4 de 15 piezas que despegaron abren con una demostración, …» → «Abren con una demostración». */
function patternName(p: WhyPattern): string {
  const m = /^\d+ de \d+ piezas que despegaron (.+?), frente a .*$/u.exec(p.label);
  const s = m?.[1] ?? p.label;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «Qué tienen en común las piezas que despegaron»: patterns counted, not guessed. */
function PatternsCard({ why }: { why: TopicDetail['why'] }) {
  return (
    <Card icon={<ListFilter />} tone="sand" title="Qué tienen en común las piezas que despegaron">
      {why.narrative && (
        <p className="mb-4 max-w-4xl text-[0.92rem] leading-relaxed text-ink-2">{why.narrative}</p>
      )}
      {why.patterns.length ? (
        <div className={table.wrap}>
          <table className={clsx(table.table, 'min-w-[560px]')}>
            <thead>
              <tr>
                <th className={clsx(table.th, 'w-[40%]')}>Patrón</th>
                <th className={table.th}>Piezas que despegaron</th>
                <th className={table.th}>Resto</th>
                <th className={table.th}>Lift</th>
              </tr>
            </thead>
            <tbody>
              {why.patterns.map((p) => (
                <tr key={`${p.feature}-${p.value}`}>
                  <td className={table.td} title={p.label}>
                    {patternName(p)}
                  </td>
                  <td className={clsx(table.td, 'tabular-nums')}>
                    {p.outliers} de {p.outlierTotal}
                  </td>
                  <td className={clsx(table.td, 'tabular-nums')}>
                    {p.rest} de {p.restTotal}
                  </td>
                  <td className={clsx(table.td, 'font-[700] tabular-nums')}>
                    ×{p.lift.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[0.92rem] text-ink-3">
          Todavía no hay suficientes piezas que despegaron para contar patrones.
        </p>
      )}
      <p className="mt-3 text-[0.78rem] text-ink-3">
        Despegó = 2× o más la mediana de su propio autor. Lift: cuántas veces más común es el patrón
        entre las que despegaron que en el resto.
      </p>
    </Card>
  );
}

/** «Ya funcionó en inglés y portugués»: each original next to its idea in Spanish. */
function InspirationCard({ pieces }: { pieces: TopicDetail['inspiration'] }) {
  return (
    <Card icon={<Check />} tone="sand" title="Ya funcionó en inglés y portugués">
      <div className={table.wrap}>
        <table className={clsx(table.table, 'min-w-[880px]')}>
          <thead>
            <tr>
              <th className={clsx(table.th, 'w-[31%]')}>Pieza original</th>
              <th className={table.th}>Red · autor</th>
              <th className={table.th}>Métricas</th>
              <th className={clsx(table.th, 'w-[7.5rem]')}>× mediana del autor</th>
              <th className={clsx(table.th, 'w-[28%]')}>La idea en español</th>
            </tr>
          </thead>
          <tbody>
            {pieces.map((p) => (
              <tr key={p.id} className="group">
                <td className={table.td}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    lang={p.lang}
                    className="flex items-center gap-3 hover:text-brand"
                  >
                    <span
                      className={clsx(
                        'grid size-9 shrink-0 place-items-center rounded-[8px] text-[0.72rem] font-[750]',
                        p.lang === 'pt'
                          ? 'bg-st-emergente-tint text-st-emergente'
                          : 'bg-lavender-tint text-brand-strong',
                      )}
                      title={LANG_COPY[p.lang]}
                    >
                      {LANG_SHORT[p.lang]}
                    </span>
                    <span className="line-clamp-2 leading-snug">
                      “{p.hook || p.title || p.text}”
                      <ArrowUpRight
                        className="ml-0.5 inline size-3.5 text-ink-3 group-hover:text-brand"
                        aria-label="Abrir el original"
                      />
                    </span>
                  </a>
                </td>
                <td className={clsx(table.td, 'leading-snug')}>
                  {PLATFORM_COPY[p.platform]} · {p.authorName}
                </td>
                <td className={clsx(table.td, 'leading-snug')}>{pieceMetrics(p) || '—'}</td>
                <td
                  className={clsx(
                    table.td,
                    'font-[700] tabular-nums',
                    p.outlier !== null && p.outlier >= 5 && 'text-marker-strong',
                  )}
                >
                  {p.outlier !== null ? fmtRatio(p.outlier) : '—'}
                </td>
                <td className={clsx(table.td, 'leading-snug')}>
                  {p.es ? `«${p.es}»` : <span className="text-ink-3">Sin traducción todavía.</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** «¿30X ya habló de esto?»: its own pieces on the topic, or the room to be first. */
function CoverageCard({ coverage }: { coverage: TopicDetail['coverage'] }) {
  return (
    <Card icon={<Megaphone />} tone="orange" title="¿30X ya habló de esto?">
      {coverage.length ? (
        <div className="grid gap-4">
          {coverage.map((c) => (
            <div key={c.name} className="grid gap-1.5">
              <p className="text-[0.8rem] font-[700] text-ink-3">{c.name}</p>
              <ul className="grid gap-1.5">
                {c.pieces.map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.92rem] text-ink hover:text-brand"
                    >
                      {(p.hook || p.title || p.text).slice(0, 140)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.92rem] text-ink-2">
          Ni 30X ni Andrés Bilbao lo han tocado en sus perfiles. Llegar primero es posible.
        </p>
      )}
    </Card>
  );
}

export default function TopicPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error } = useApi<TopicDetail>(`/api/v1/topics/${id}`);

  if (error)
    return (
      <Page>
        <Empty
          title="No encontramos ese tema"
          action={
            <Link href="/radar" className="font-[600] text-brand">
              Volver al radar
            </Link>
          }
        >
          {error instanceof Error ? error.message : null}
        </Empty>
      </Page>
    );
  if (!data)
    return (
      <Page className="grid gap-5">
        <p className="text-ink-2" role="status">
          Abriendo el tema. La primera vez tarda unos segundos: el radar cuenta los patrones y
          escribe por qué crece.
        </p>
        <Skeleton className="h-24" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-72" />
      </Page>
    );

  const t = data.topic;
  const cited = new Set(data.why.cited);
  const stats = [
    t.fresh ? 'Nuevo esta semana' : fmtGrowth(t.growthPct),
    `${fmtInt(t.creators)} creadores`,
    `${fmtInt(t.pieces)} piezas`,
  ];

  return (
    <Page className="grid gap-5 [&>*]:min-w-0">
      <header className="grid gap-4">
        <Link
          href="/radar"
          className="inline-flex w-fit items-center gap-1.5 text-[0.88rem] text-ink-2 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Radar{t.rank > 0 && ` · Tema #${t.rank}`}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <TopicTile id={t.id} name={t.name} />
            <div className="grid min-w-0 gap-2">
              <h1 className="text-[1.6rem] leading-tight font-[700] tracking-[-0.02em] text-ink sm:text-[1.75rem]">
                {t.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <StageChip stage={t.stage} />
                <MomentChip timing={t.timing} />
                {!t.confirmed && <UnconfirmedChip growingIn={t.growingIn} />}
                {t.untouched && (
                  <span className="inline-flex items-center rounded-[6px] bg-lavender-tint px-2 py-[3px] text-[0.75rem] font-[700] whitespace-nowrap text-brand-strong">
                    Sin explotar por 30X
                  </span>
                )}
                <span className="text-[0.92rem] text-ink-2 tabular-nums">{stats.join(' · ')}</span>
              </div>
            </div>
          </div>
          <Link
            href={`/tema/${t.id}/contar`}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-[0.92rem] font-[650] text-sheet transition hover:opacity-90"
          >
            Cómo lo contamos <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        {t.definition && (
          <p className="max-w-3xl text-[0.95rem] leading-relaxed text-ink-2">{t.definition}</p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <WhyCard topic={t} trigger={data.trigger} />
        <FitCard fit={data.fit} />
        <LangCard topic={t} />
      </div>

      <div
        className={clsx('grid gap-4 [&>*]:min-w-0', data.history.length > 0 && 'lg:grid-cols-2')}
      >
        <Card title="Curva semanal · 8 semanas">
          <LangWeekChart languages={t.languages} weekly={data.weekly} />
        </Card>
        {data.history.length > 0 && (
          <Card title="Historia larga">
            <HistoryArea series={data.history} />
          </Card>
        )}
      </div>

      <PatternsCard why={data.why} />

      {data.inspiration.length > 0 && <InspirationCard pieces={data.inspiration} />}

      <section className="grid gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <IconTile tone="sand">
            <Newspaper />
          </IconTile>
          <h2 className="text-[1rem] font-[700] text-ink">La evidencia</h2>
        </div>
        <p className="max-w-3xl text-[0.92rem] text-ink-2">
          Las piezas de los últimos 14 días que mejor funcionaron frente a la mediana de su propio
          autor. Las marcadas son las que cita el análisis.
        </p>
        {data.evidence.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.evidence.map((p) => (
              <PieceCard key={p.id} piece={p} cited={cited.has(p.id)} />
            ))}
          </div>
        ) : (
          <Empty title="Sin piezas recientes" />
        )}
      </section>

      <CoverageCard coverage={data.coverage} />
    </Page>
  );
}
