'use client';

import { ArrowLeft, ArrowUpRight, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AdaptationPanel } from '@/components/adaptation-panel';
import { FitMeter, PlatformChips, TimingChip, UnconfirmedChip } from '@/components/marks';
import { PieceCard } from '@/components/piece-card';
import { Page } from '@/components/shell';
import { HistoryLine, LanguageCurves, WeeklyBars } from '@/components/topic-charts';
import { Empty, Skeleton, StageTag, fmtCompact, fmtGrowth, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { languageStory } from '@/lib/language';
import { LANG_COPY, LANG_SHORT, PLATFORM_COPY, type TopicDetail, type TopicFit } from '@/lib/types';

const fmtDay = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Bogota',
});

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-[0.88rem] text-ink-2">{label}</span>
      <span className="t-figure text-[0.95rem] text-ink">{value}/10</span>
      <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-fill" aria-hidden>
        <span className="block h-full rounded-full bg-brand" style={{ width: `${value * 10}%` }} />
      </span>
    </div>
  );
}

function FitCard({ fit }: { fit: TopicFit | null }) {
  return (
    <section className="grid gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="t-h3 text-ink">¿Le sirve a 30X?</h2>
        {fit && <FitMeter fit={fit.score} />}
      </div>
      {fit ? (
        <>
          <div className="grid gap-3">
            <Score label="Relevancia para ejecutivos" value={fit.executive} />
            <Score label="Se aplica sin programar" value={fit.noCode} />
            <Score label="Ángulo latinoamericano" value={fit.latam} />
          </div>
          <p className="text-[0.9rem] text-ink-2">
            Programa de 30X que mejor lo cuenta:{' '}
            <span className="font-[700] text-ink">{fit.pillar}</span>. Riesgo de humo:{' '}
            <span className="font-[700] text-ink">{fit.hypeRisk}</span>.
          </p>
          <ul className="grid gap-1 text-[0.9rem] text-ink-2">
            {fit.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-ink-3">El encaje se mide cuando el modelo está disponible.</p>
      )}
    </section>
  );
}

const fmtShort = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Bogota',
});

/**
 * «Ya funcionó en inglés y portugués»: each piece next to its idea in Spanish, like a facing-page
 * translation. The original keeps its language; the Spanish side is what the team adapts.
 */
function Inspiration({ pieces }: { pieces: TopicDetail['inspiration'] }) {
  return (
    <section className="grid gap-3">
      <h2 className="t-h2 text-ink">Ya funcionó en inglés y portugués</h2>
      <p className="-mt-1 max-w-3xl text-ink-2">
        Lo que más despegó en otros idiomas, con su idea en español: la materia prima para contarlo
        primero aquí.
      </p>
      <div className="sheet">
        <div className="hidden grid-cols-2 gap-8 border-b border-rule px-5 py-2.5 text-[0.8rem] font-[650] text-ink-3 md:grid">
          <span>Lo que publicaron</span>
          <span>La idea en español</span>
        </div>
        <ol className="divide-y divide-rule">
          {pieces.map((p) => {
            const ratio = p.outlier;
            const meta = [
              PLATFORM_COPY[p.platform],
              fmtShort.format(new Date(p.publishedAt)),
              p.views ? `${fmtCompact(p.views)} vistas` : null,
              p.likes ? `${fmtCompact(p.likes)} reacciones` : null,
            ].filter(Boolean);
            return (
              <li key={p.id} className="grid gap-x-8 gap-y-2 px-5 py-4 md:grid-cols-2">
                <div className="grid content-start gap-1.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] text-ink-3">
                    <span
                      className={
                        p.lang === 'pt'
                          ? 'rounded-[5px] bg-lang-pt px-1.5 text-[0.7rem] leading-[1.15rem] font-[760] text-white'
                          : 'rounded-[5px] bg-lang-en px-1.5 text-[0.7rem] leading-[1.15rem] font-[760] text-white'
                      }
                      title={LANG_COPY[p.lang]}
                    >
                      {LANG_SHORT[p.lang]}
                    </span>
                    <span className="font-[680] text-ink-2">{p.authorName}</span>
                    {meta.join(', ')}
                    {ratio !== null && ratio >= 1.5 && (
                      <span className="font-[680] text-ink">
                        {ratio.toLocaleString('es-CO', { maximumFractionDigits: 1 })}× su mediana
                      </span>
                    )}
                  </p>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    lang={p.lang}
                    className="group line-clamp-4 text-[0.95rem] leading-snug text-ink-2 hover:text-brand"
                  >
                    {p.hook || p.title || p.text}{' '}
                    <ArrowUpRight
                      className="inline size-3.5 text-ink-3 group-hover:text-brand"
                      aria-label="Abrir el original"
                    />
                  </a>
                </div>
                <p className="text-[1.02rem] leading-snug font-[560] text-ink">
                  <span className="sr-only">En español: </span>
                  {p.es ?? 'Sin traducción todavía.'}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
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
      <Page className="grid gap-6">
        <p className="text-ink-2" role="status">
          Abriendo el tema. La primera vez tarda unos segundos: el radar cuenta los patrones y
          escribe por qué crece.
        </p>
        <Skeleton className="h-40" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-[480px]" />
          <Skeleton className="h-[480px]" />
        </div>
      </Page>
    );

  const t = data.topic;
  const cited = new Set(data.why.cited);

  return (
    <Page className="grid gap-10">
      <header className="grid gap-4">
        <Link
          href="/radar"
          className="inline-flex w-fit items-center gap-1.5 text-[0.92rem] font-[600] text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> El radar de la semana
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {t.rank > 0 && (
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-[0.8rem] font-[760] text-sheet">
              #{t.rank} {t.rankScope === '30x' ? 'para 30X esta semana' : 'entre todos los temas'}
            </span>
          )}
          <StageTag stage={t.stage} />
          <TimingChip timing={t.timing} />
          {!t.confirmed && <UnconfirmedChip growingIn={t.growingIn} />}
          {t.untouched && (
            <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[0.8rem] font-[680] text-brand">
              Sin explotar por 30X
            </span>
          )}
        </div>
        <h1 className="t-display max-w-4xl text-ink">{t.name}</h1>
        {t.definition && (
          <p className="max-w-3xl text-[1.1rem] leading-relaxed text-ink-2">{t.definition}</p>
        )}
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-[0.82rem] text-ink-3">Crecimiento</dt>
            <dd className="t-figure text-[1.8rem] leading-none text-ink">
              {t.fresh ? 'Nuevo esta semana' : fmtGrowth(t.growthPct)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.82rem] text-ink-3">Creadores esta semana</dt>
            <dd className="t-figure text-[1.8rem] leading-none text-ink">{fmtInt(t.creators)}</dd>
          </div>
          <div>
            <dt className="mb-1 text-[0.82rem] text-ink-3">Dónde se mueve</dt>
            <dd>
              <PlatformChips platforms={t.platforms} max={6} />
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <section className="sheet grid gap-4 p-5 sm:p-6">
            <h2 className="t-h3 text-ink">Por qué crece</h2>
            {t.why ? (
              <p className="text-[1.2rem] leading-snug font-[620] text-ink">{t.why}</p>
            ) : (
              <p className="text-ink-3">Sin explicación todavía.</p>
            )}
            {data.why.narrative && (
              <p className="max-w-3xl leading-relaxed text-ink-2">{data.why.narrative}</p>
            )}
            {data.why.patterns.length > 0 && (
              <div className="grid gap-2.5 border-t border-rule pt-4">
                <p className="text-[0.84rem] font-[700] text-ink-3">
                  Contado entre las piezas que despegaron (2× o más la mediana de su autor)
                </p>
                <ul className="grid gap-2.5">
                  {data.why.patterns.map((p) => (
                    <li key={`${p.feature}-${p.value}`} className="grid gap-1">
                      <span className="text-[0.95rem] text-ink">{p.label}</span>
                      <span className="flex h-2 gap-1" aria-hidden>
                        <span
                          className="rounded-full bg-marker"
                          style={{ width: `${(p.outliers / Math.max(1, p.outlierTotal)) * 60}%` }}
                        />
                        <span
                          className="rounded-full bg-rule-strong"
                          style={{ width: `${(p.rest / Math.max(1, p.restTotal)) * 60}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[0.78rem] text-ink-3">
                  Naranja: las que despegaron. Gris: el resto.
                </p>
              </div>
            )}
          </section>

          <section className="sheet grid gap-4 p-5 sm:p-6">
            <h2 className="t-h3 text-ink">La ola por idioma</h2>
            <p className="max-w-3xl leading-relaxed text-ink-2">{languageStory(t)}</p>
            <LanguageCurves languages={t.languages} weeks={data.weekly.map((w) => w.week)} />
          </section>

          {data.inspiration.length > 0 && <Inspiration pieces={data.inspiration} />}

          <section className="grid gap-3">
            <h2 className="t-h2 text-ink">La evidencia</h2>
            <p className="-mt-1 max-w-3xl text-ink-2">
              Las piezas de los últimos 14 días que mejor funcionaron frente a la mediana de su
              propio autor.
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
        </div>

        <aside className="sheet grid divide-y divide-rule">
          <FitCard fit={data.fit} />
          <section className="grid gap-3 p-5">
            <h2 className="t-h3 text-ink">La curva</h2>
            <p className="text-[0.86rem] text-ink-2">
              Creadores distintos por semana en las fuentes que se muestrean igual cada semana.
            </p>
            <WeeklyBars weeks={data.weekly} />
          </section>
          {data.trigger && (
            <section className="grid gap-2 p-5">
              <h2 className="t-h3 flex items-center gap-2 text-ink">
                <Newspaper className="size-4 text-brand" aria-hidden /> Qué lo disparó
              </h2>
              <p className="text-[0.84rem] text-ink-3">
                {fmtDay.format(new Date(data.trigger.date))}, {data.trigger.source}
              </p>
              <a
                href={data.trigger.url}
                target="_blank"
                rel="noreferrer"
                className="group text-[0.98rem] font-[620] text-ink hover:text-brand"
              >
                {data.trigger.title}{' '}
                <ArrowUpRight
                  className="inline size-4 text-ink-3 group-hover:text-brand"
                  aria-hidden
                />
              </a>
            </section>
          )}
          {data.history.length > 0 && (
            <section className="grid gap-4 p-5">
              <h2 className="t-h3 text-ink">Historia larga</h2>
              {data.history.map((h) => (
                <HistoryLine key={h.source} points={h.points} label={h.label} />
              ))}
            </section>
          )}
          <section className="grid gap-2 p-5">
            <h2 className="t-h3 text-ink">¿30X ya habló de esto?</h2>
            {data.coverage.length ? (
              <ul className="grid gap-2">
                {data.coverage[0]!.pieces.map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[0.92rem] text-ink hover:text-brand"
                    >
                      {(p.hook || p.title || p.text).slice(0, 110)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[0.92rem] text-ink-2">
                Ni 30X ni Andrés Bilbao lo han tocado en sus perfiles. Llegar primero es posible.
              </p>
            )}
          </section>
        </aside>
      </div>

      <section id="contar" className="grid scroll-mt-24 gap-4">
        <div>
          <h2 className="t-h2 text-ink">Cómo lo contamos</h2>
          <p className="mt-1 max-w-3xl text-ink-2">
            Piezas listas para revisar, con la voz de 30X y los ganchos que funcionaron esta semana.
          </p>
        </div>
        <AdaptationPanel topicId={t.id} inspiration={data.inspiration} />
      </section>
    </Page>
  );
}
