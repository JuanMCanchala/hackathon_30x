'use client';

import { Check, X } from 'lucide-react';
import { Page } from '@/components/shell';
import { PageHeader, Skeleton, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { PLATFORM_COPY, type Platform } from '@/lib/types';

interface WaveRow {
  id: string;
  name: string;
  event: string;
  peakWeek: string | null;
  detectedWeek: string | null;
  leadDays: number | null;
  detected: boolean;
  early: boolean;
  hnToWikipediaSignalDays: number | null;
}

interface Evaluation {
  asOf: string;
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

const usd = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
const fmtWeek = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function Figure({
  value,
  label,
  note,
  strong,
}: {
  value: string;
  label: string;
  note?: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? 'grid content-start gap-1 rounded-[22px] bg-marker p-5 text-on-marker'
          : 'sheet grid content-start gap-1 p-5'
      }
    >
      <p className="t-figure text-[2.6rem] leading-none">{value}</p>
      <p className="font-[700]">{label}</p>
      {note && (
        <p className={strong ? 'text-[0.88rem] opacity-80' : 'text-[0.88rem] text-ink-2'}>{note}</p>
      )}
    </div>
  );
}

export default function EvaluationPage() {
  const { data } = useApi<Evaluation>('/api/v1/evaluation');
  if (!data)
    return (
      <Page>
        <Skeleton className="h-[640px]" />
      </Page>
    );
  const b = data.backtest;
  const s = b?.summary;

  return (
    <Page className="grid gap-10">
      <PageHeader
        title="¿Lo habría visto venir?"
        lead="El detector del radar, puesto a prueba contra olas de IA que ya pasaron: corre semana por semana con solo lo que se sabía en ese momento, y se compara con el día en que cada ola tocó su pico."
      />

      {s && (
        <section className="grid gap-4 md:grid-cols-3">
          <Figure
            strong
            value={`${s.detected} de ${s.waves}`}
            label="olas detectadas antes o en su pico"
            note={`${s.early} con días de anticipación.`}
          />
          <Figure
            value={s.medianLeadDays !== null ? `${fmtInt(s.medianLeadDays)} días` : 'sin dato'}
            label="de anticipación, en la mediana"
            note="Entre la primera señal y el pico de la ola."
          />
          <Figure
            value={`${s.falseAlarms} de ${s.controls}`}
            label="falsas alarmas"
            note="Temas estables (Excel, Linux, Python…) que nunca debían sonar."
          />
        </section>
      )}

      {b && (
        <section className="grid gap-3">
          <h2 className="t-h2 text-ink">Ola por ola</h2>
          <p className="-mt-1 max-w-3xl text-ink-2">
            Señal: una semana con {b.params.signalLift} veces su nivel de las{' '}
            {b.params.baselineWeeks} anteriores y al menos {b.params.minVolume} de volumen, en{' '}
            {b.sources
              .map((x) =>
                x === 'hn' ? 'Hacker News' : x === 'wikipedia' ? 'Wikipedia' : 'Bluesky',
              )
              .join(' y ')}
            .
          </p>
          <div className="sheet overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[0.92rem]">
              <thead className="border-b border-rule text-[0.8rem] text-ink-3">
                <tr>
                  <th className="px-5 py-2.5 font-[600]">Ola</th>
                  <th className="px-3 py-2.5 font-[600]">Primera señal</th>
                  <th className="px-3 py-2.5 font-[600]">Pico</th>
                  <th className="px-3 py-2.5 font-[600]">Anticipación</th>
                  <th className="px-5 py-2.5 font-[600]">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {b.waves.map((w) => (
                  <tr key={w.id}>
                    <td className="px-5 py-3 font-[650] text-ink">{w.name}</td>
                    <td className="px-3 py-3 text-ink-2">
                      {w.detectedWeek ? fmtWeek.format(new Date(w.detectedWeek)) : '—'}
                    </td>
                    <td className="px-3 py-3 text-ink-2">
                      {w.peakWeek ? fmtWeek.format(new Date(w.peakWeek)) : '—'}
                    </td>
                    <td className="t-figure px-3 py-3 text-ink">
                      {w.detected && w.leadDays !== null ? `${w.leadDays} días` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      {w.detected ? (
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <Check className="size-4 text-paid" strokeWidth={3} aria-hidden />{' '}
                          {w.early ? 'Antes del pico' : 'En el pico'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-ink-2">
                          <X className="size-4 text-held" strokeWidth={3} aria-hidden /> No la vio
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s?.medianHnToWikipediaSignalDays !== null &&
            s?.medianHnToWikipediaSignalDays !== undefined && (
              <p className="max-w-3xl text-ink-2">
                Lo técnico anticipa lo masivo: en la mediana, la señal aparece en Hacker News{' '}
                {s.medianHnToWikipediaSignalDays} días antes que en Wikipedia. Por eso el radar
                escucha el carril técnico para avisar lo que todavía no llega a LinkedIn.
              </p>
            )}
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="t-h2 text-ink">Con qué se mide esta semana</h2>
        <p className="-mt-1 max-w-3xl text-ink-2">
          {fmtInt(data.corpus.read)} piezas públicas leídas por el modelo, {fmtInt(data.corpus.ai)}{' '}
          sobre IA, agrupadas en {fmtInt(data.corpus.topics)} temas. El crecimiento se mide solo en
          fuentes que se muestrean igual cada semana (Bluesky, Google Noticias, Hacker News y
          repositorios nuevos de GitHub); LinkedIn, Instagram, YouTube, X y TikTok dicen dónde ya
          llegó cada tema y dan la evidencia.
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.corpus.byPlatform.map((p) => (
            <li
              key={p.platform}
              className="sheet flex items-baseline justify-between gap-2 px-4 py-3"
            >
              <span className="font-[650] text-ink">{PLATFORM_COPY[p.platform] ?? p.platform}</span>
              <span className="t-figure text-ink-2">
                {fmtInt(p.pieces)} <span className="text-[0.8rem] font-[500]">piezas</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3">
        <h2 className="t-h2 text-ink">Lo que cuesta</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Figure
            value={usd(data.cost.weekUsd)}
            label="esta semana"
            note={`${usd(data.cost.llmUsd)} de modelo y ${usd(data.cost.dataUsd)} de datos pagos.`}
          />
          <Figure
            value="USD 0"
            label="en fuentes abiertas"
            note="Bluesky, Google Noticias, Hacker News, GitHub, Hugging Face, YouTube y perfiles públicos."
          />
          <Figure
            value="USD 19–50 mil"
            label="al año, una suite de social listening"
            note="Medianas de Brandwatch, Meltwater y Sprout Social según Vendr."
          />
        </div>
      </section>
    </Page>
  );
}
