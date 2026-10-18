'use client';

/**
 * «Evaluación»: the radar's detector run against AI waves that already happened, how long a wave
 * takes to reach Spanish, and the data and cost behind this week's reading.
 */
import clsx from 'clsx';
import { Card, PageHead, table } from '@/components/kit';
import { Page } from '@/components/shell';
import { Skeleton, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { LANG_SHORT, PLATFORM_COPY, type Lang, type Platform, type Radar } from '@/lib/types';

interface WaveRow {
  id: string;
  name: string;
  event: string;
  peakWeek: string | null;
  detectedWeek: string | null;
  detectedBy?: string[];
  leadDays: number | null;
  detected: boolean;
  early: boolean;
  hnToWikipediaSignalDays: number | null;
}

interface LanguageLag {
  topics: number;
  sameWeek: number;
  later: number;
  laterMedianDays: number | null;
  waiting: number;
  waitingMedianDays: number | null;
  stillOpen: number;
  examples: { name: string; leader: Lang; lagDays: number; open: boolean; reached: boolean }[];
}

interface Evaluation {
  asOf: string;
  languageLag: LanguageLag;
  backtest: {
    params: { signalLift: number; minVolume: number; baselineWeeks: number };
    sources: string[];
    waves: WaveRow[];
    controls: { id: string; name: string; falseAlarm: boolean }[];
    summary: {
      waves: number;
      detected: number;
      early: number;
      medianLeadDays: number | null;
      controls: number;
      falseAlarms: number;
      medianHnToWikipediaSignalDays: number | null;
    };
  } | null;
  corpus: {
    byPlatform: { platform: Platform; pieces: number; creators: number }[];
    read: number;
    ai: number;
    topics: number;
    captures: number;
  };
  cost: { weekUsd: number; llmUsd: number; dataUsd: number };
}

const SOURCE_NAME: Record<string, string> = {
  wikipedia: 'Wikipedia',
  hn: 'Hacker News',
  bluesky: 'Bluesky',
};
const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);
const usd = (n: number) =>
  `USD ${n.toLocaleString('es-CO', { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 });
const fmtWeek = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const week = (iso: string | null) => (iso ? fmtWeek.format(new Date(iso)).replace('.', '') : '—');
const weeks = (days: number) => {
  const w = Math.round(days / 7);
  return w === 1 ? 'una semana' : `${w} semanas`;
};

/** A big KPI tile: the figure on top, what it means below. */
function BigFigure({
  value,
  unit,
  label,
  tone,
}: {
  value: string;
  unit?: string;
  label: string;
  tone: 'dark' | 'white' | 'lavender';
}) {
  return (
    <div
      className={clsx(
        'grid min-h-[124px] content-end gap-2 rounded-[14px] px-5 py-5',
        tone === 'dark' && 'bg-ink text-sheet',
        tone === 'white' && 'border border-rule bg-sheet text-ink',
        tone === 'lavender' && 'bg-lavender text-on-lavender',
      )}
    >
      <p
        className={clsx(
          'text-[2.75rem] leading-none font-[800] tracking-[-0.03em] tabular-nums',
          tone === 'dark' && 'text-marker',
        )}
      >
        {value}
        {unit && <span className="ml-1.5 text-[1.3rem] tracking-[-0.02em]">{unit}</span>}
      </p>
      <p className="text-[0.95rem]">{label}</p>
    </div>
  );
}

/** A sand tile with a small label and a figure. */
function DataTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid content-start gap-1 rounded-[10px] bg-sheet-2 px-4 py-4">
      <p className="text-[0.78rem] text-ink-2">{label}</p>
      <p className="text-[1.4rem] leading-tight font-[700] tracking-[-0.01em] text-ink tabular-nums">
        {value}
      </p>
    </div>
  );
}

/** How far ahead English or Portuguese ran, as horizontal bars. */
function LanguageLagCard({ lag }: { lag: LanguageLag }) {
  const max = Math.max(7, ...lag.examples.map((e) => e.lagDays));
  return (
    <Card title="¿Cuánto tarda en llegar al español?" className="min-w-0">
      <ul className="grid gap-3">
        {lag.examples.map((e) => (
          <li
            key={e.name}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem]"
          >
            <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
              <span
                className={clsx(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[0.66rem] font-[700]',
                  e.leader === 'pt'
                    ? 'bg-st-emergente-tint text-st-emergente'
                    : 'bg-lavender-tint text-brand',
                )}
                title={e.leader === 'pt' ? 'Empezó en portugués' : 'Empezó en inglés'}
              >
                {LANG_SHORT[e.leader]}
              </span>
              <span className="truncate text-[0.9rem] text-ink">{e.name}</span>
            </span>
            <span
              className="col-span-2 col-start-1 row-start-2 block h-2.5 overflow-hidden rounded-full bg-fill sm:col-span-1 sm:col-start-2 sm:row-start-1"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-marker"
                style={{ width: `${(e.lagDays / max) * 100}%` }}
              />
            </span>
            <span className="col-start-2 row-start-1 text-right sm:col-start-3 text-[0.88rem] font-[700] text-ink tabular-nums">
              {e.lagDays} días
              {!e.reached && (
                <span className="block text-[0.72rem] font-[500] text-ink-3">y contando</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[0.9rem] text-ink-2">
        De {fmtInt(lag.topics)} temas que despegaron en inglés o portugués, el español despegó la
        misma semana en {fmtInt(lag.sameWeek)}
        {lag.later > 0 && lag.laterMedianDays !== null
          ? `, después en ${fmtInt(lag.later)} (${weeks(lag.laterMedianDays)} más tarde en la mediana)`
          : ''}{' '}
        y todavía no despega en {fmtInt(lag.waiting)}. {fmtInt(lag.stillOpen)} siguen con la ventana
        abierta.
      </p>
      <p className="mt-2 text-[0.78rem] text-ink-3">
        Días entre el despegue en inglés o portugués y la llegada al español; «y contando» si el
        español todavía no llega.
      </p>
    </Card>
  );
}

export default function EvaluationPage() {
  const { data } = useApi<Evaluation>('/api/v1/evaluation');
  const { data: radar } = useApi<Radar>('/api/v1/radar');
  if (!data)
    return (
      <Page>
        <Skeleton className="h-[640px]" />
      </Page>
    );
  const b = data.backtest;
  const s = b?.summary;
  const hnLead = s?.medianHnToWikipediaSignalDays ?? null;

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHead
        crumbs={[{ label: 'Medir', href: '/evaluacion' }, { label: 'Evaluación' }]}
        title="¿Lo habría visto venir?"
        lead="Backtest contra ondas de IA que ya pasaron, con solo lo que se sabía en cada momento."
        className="mb-1"
      />

      {s && (
        <section className="grid gap-4 md:grid-cols-3">
          <BigFigure
            tone="dark"
            value={`${s.detected}/${s.waves}`}
            label={`ondas detectadas a tiempo (${s.early} antes del pico)`}
          />
          <BigFigure
            tone="white"
            value={s.medianLeadDays !== null ? num(s.medianLeadDays) : '—'}
            unit={s.medianLeadDays !== null ? 'días' : undefined}
            label="de anticipación (mediana)"
          />
          <BigFigure
            tone="lavender"
            value={`${s.falseAlarms}/${s.controls}`}
            label="falsas alarmas en temas estables"
          />
        </section>
      )}

      {b && (
        <Card title="Onda por onda">
          <div className={table.wrap}>
            <table className={clsx(table.table, 'min-w-[720px]')}>
              <thead>
                <tr>
                  <th className={table.th}>Onda</th>
                  <th className={table.th}>Primera señal</th>
                  <th className={table.th}>Pico</th>
                  <th className={table.th}>Anticipación</th>
                  <th className={table.th}>Fuentes que coincidieron</th>
                </tr>
              </thead>
              <tbody>
                {b.waves.map((w) => (
                  <tr key={w.id}>
                    <td className={clsx(table.td, 'font-[700]')}>{w.name}</td>
                    <td className={clsx(table.td, 'whitespace-nowrap text-ink-2')}>
                      {w.detected ? week(w.detectedWeek) : 'No la vio'}
                    </td>
                    <td className={clsx(table.td, 'whitespace-nowrap text-ink-2')}>
                      {week(w.peakWeek)}
                    </td>
                    <td
                      className={clsx(
                        table.td,
                        'whitespace-nowrap tabular-nums',
                        w.detected && (w.leadDays ?? 0) > 0
                          ? 'font-[700] text-marker-strong'
                          : 'text-ink-2',
                      )}
                    >
                      {!w.detected || w.leadDays === null
                        ? '—'
                        : w.leadDays > 0
                          ? `${w.leadDays} días`
                          : 'En el pico'}
                    </td>
                    <td className={table.td}>
                      {w.detectedBy && w.detectedBy.length > 0
                        ? w.detectedBy.map((x) => SOURCE_NAME[x] ?? x).join(' + ')
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.8rem] text-ink-3">
            {b.waves.length} ondas y {b.controls.length} temas de control. Señal: una semana con{' '}
            {num(b.params.signalLift)} veces su nivel de las {b.params.baselineWeeks} anteriores y
            al menos {b.params.minVolume} de volumen, en dos fuentes a la vez entre{' '}
            {list(b.sources.map((x) => SOURCE_NAME[x] ?? x))}.
          </p>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {data.languageLag?.topics > 0 && <LanguageLagCard lag={data.languageLag} />}
        <Card title="Con qué datos se midió la semana" className="min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <DataTile label="Piezas" value={radar ? fmtInt(radar.basis.pieces) : '…'} />
            <DataTile label="Creadores" value={radar ? fmtInt(radar.basis.creators) : '…'} />
            <DataTile label="Fuentes" value={radar ? fmtInt(radar.basis.sources) : '…'} />
            <DataTile label="Costo del modelo" value={usd(data.cost.llmUsd)} />
          </div>
          <p className="mt-4 text-[0.8rem] text-ink-3">
            Lo que leyó el radar en la última semana. Costo total de la semana{' '}
            {usd(data.cost.weekUsd)}: {usd(data.cost.llmUsd)} de modelo y {usd(data.cost.dataUsd)}{' '}
            de datos pagos. Las fuentes abiertas cuestan USD 0; una suite de social listening, entre
            USD 19 y 50 mil al año (medianas de Brandwatch, Meltwater y Sprout Social según Vendr).
          </p>
        </Card>
      </div>

      {b && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Temas de control" className="min-w-0">
            <p className="text-[0.9rem] text-ink-2">
              Temas estables que nunca debían sonar. Con una sola fuente, entre 60 y 80 % de ellos
              daban falsas alarmas; con dos a la vez, sonaron {s?.falseAlarms ?? 0} de{' '}
              {b.controls.length}.
            </p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {b.controls.map((c) => (
                <li
                  key={c.id}
                  className={clsx(
                    'rounded-[6px] px-2 py-[3px] text-[0.8rem] font-[600]',
                    c.falseAlarm ? 'bg-marker/15 text-marker-strong' : 'bg-fill text-ink-2',
                  )}
                >
                  {c.name}
                  {c.falseAlarm && ' · sonó'}
                </li>
              ))}
            </ul>
          </Card>
          {hnLead !== null && (
            <Card title="Lo técnico anticipa lo masivo" className="min-w-0">
              <p className="text-[2rem] leading-none font-[800] tracking-[-0.02em] text-ink tabular-nums">
                {num(hnLead)} <span className="text-[1.1rem]">días</span>
              </p>
              <p className="mt-2 text-[0.9rem] text-ink-2">
                En la mediana, la señal aparece en Hacker News {num(hnLead)} días antes que en
                Wikipedia. Por eso el radar escucha el carril técnico para avisar lo que todavía no
                llega a LinkedIn.
              </p>
            </Card>
          )}
        </div>
      )}

      <Card title="Todo lo que ha leído el radar">
        <p className="text-[0.9rem] text-ink-2">
          {fmtInt(data.corpus.read)} piezas públicas leídas por el modelo, {fmtInt(data.corpus.ai)}{' '}
          sobre IA, agrupadas en {fmtInt(data.corpus.topics)} temas. El crecimiento se mide solo en
          fuentes que se muestrean igual cada semana; LinkedIn, Instagram, YouTube, X y TikTok dicen
          dónde ya llegó cada tema y dan la evidencia.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.corpus.byPlatform.map((p) => (
            <li
              key={p.platform}
              className="flex items-baseline justify-between gap-2 rounded-[10px] bg-sheet-2 px-4 py-3"
            >
              <span className="font-[600] text-ink">{PLATFORM_COPY[p.platform] ?? p.platform}</span>
              <span className="text-[0.9rem] text-ink-2 tabular-nums">
                {fmtInt(p.pieces)} <span className="text-[0.76rem]">piezas</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
