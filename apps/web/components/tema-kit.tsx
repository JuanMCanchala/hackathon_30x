'use client';

/**
 * Pieces of the topic page and «Cómo lo contamos»: the weekly curve by language on one shared
 * scale, the long-history area, and small formatters for a piece's reach.
 */
import clsx from 'clsx';
import { useState } from 'react';
import { fmtCompact, fmtInt } from './ui';
import { LANGS, LANG_COPY, type Lang, type LanguageWave, type Piece } from '@/lib/types';

/** «5,7 M vistas · 30,5 mil estrellas»: what a piece reached, in the platform's own words. */
export function pieceMetrics(p: Piece): string {
  const out: string[] = [];
  if (p.views)
    out.push(`${fmtCompact(p.views)} ${p.platform === 'huggingface' ? 'descargas' : 'vistas'}`);
  if (p.likes)
    out.push(
      `${fmtCompact(p.likes)} ${p.platform === 'github' ? 'estrellas' : p.platform === 'hn' ? 'puntos' : p.likes === 1 ? 'reacción' : 'reacciones'}`,
    );
  if (!out.length && p.comments) out.push(`${fmtCompact(p.comments)} comentarios`);
  return out.join(' · ');
}

/** «6,1×»: engagement against the author's own median. */
export const fmtRatio = (n: number) =>
  `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })}×`;

/** A smooth path through the points that never overshoots them (half-step cubic segments). */
function smooth(xy: (readonly [number, number])[]): string {
  return xy
    .map(([x, y], i) => {
      if (i === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`;
      const [px, py] = xy[i - 1]!;
      const mx = (px + x) / 2;
      return `C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

const STROKE: Record<Lang, string> = {
  en: 'text-lang-en',
  pt: 'text-lang-pt',
  es: 'text-lang-es',
};

/**
 * «Curva semanal · 8 semanas»: distinct creators per week in English, Portuguese and Spanish on
 * one scale, Spanish dashed; the topic's total in every language sits behind as a quiet area.
 */
export function LangWeekChart({
  languages,
  weekly,
}: {
  languages: Record<Lang, LanguageWave>;
  weekly: { week: string; creators: number }[];
}) {
  const width = 520;
  const height = 190;
  const top = 8;
  const bottom = 6;
  const n = Math.max(languages.en.sparkline.length, weekly.length, 2);
  const total = weekly.map((w) => w.creators);
  const max = Math.max(1, ...total, ...LANGS.flatMap((l) => languages[l].sparkline));
  const x = (i: number, len: number) => (i * width) / Math.max(1, len - 1);
  const y = (v: number) => height - bottom - (v / max) * (height - top - bottom);
  const xyOf = (s: number[]) => s.map((v, i) => [x(i, s.length), y(v)] as const);
  const fmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const totalXy = xyOf(total);
  return (
    <figure className="grid gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[190px] w-full"
        aria-hidden
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={top + (height - top - bottom) * f}
            y2={top + (height - top - bottom) * f}
            className="stroke-rule"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {totalXy.length > 1 && (
          <path
            d={`${smooth(totalXy)} L${width},${height} L0,${height} Z`}
            className="fill-ink-3"
            fillOpacity={0.09}
          />
        )}
        {LANGS.map((l) => {
          const s = languages[l].sparkline;
          if (s.length < 2) return null;
          return (
            <path
              key={l}
              d={smooth(xyOf(s))}
              fill="none"
              stroke="currentColor"
              strokeWidth={l === 'es' ? 2.6 : 3}
              strokeDasharray={l === 'es' ? '5 6' : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={STROKE[l]}
            />
          );
        })}
      </svg>
      <div className="flex justify-between font-mono text-[0.68rem] text-ink-3" aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <span
            key={i}
            title={weekly[i] ? `Semana del ${fmt.format(new Date(weekly[i].week))}` : undefined}
          >
            S{i + 1}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.84rem] text-ink-2">
        <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          {LANGS.map((l) => (
            <span key={l} className="inline-flex items-center gap-1.5">
              <span
                className={clsx(
                  'inline-block h-[3px] w-3 rounded-full',
                  l === 'en' ? 'bg-lang-en' : l === 'pt' ? 'bg-lang-pt' : 'bg-lang-es',
                )}
              />
              {LANG_COPY[l]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-[3px] bg-ink-3/20" />
            Todos los idiomas
          </span>
        </span>
        <span>Creadores distintos por semana</span>
      </figcaption>
      {/* A table ignores sr-only's 1px width; the div clips it so it never widens a phone page. */}
      <div className="sr-only">
        <table>
          <caption>Creadores distintos por semana y por idioma</caption>
          <thead>
            <tr>
              <th>Semana</th>
              {LANGS.map((l) => (
                <th key={l}>{LANG_COPY[l]}</th>
              ))}
              <th>Todos</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: n }, (_, i) => (
              <tr key={i}>
                <th>{weekly[i]?.week ?? `S${i + 1}`}</th>
                {LANGS.map((l) => (
                  <td key={l}>{languages[l].sparkline[i] ?? ''}</td>
                ))}
                <td>{total[i] ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

const SOURCE_COPY: Record<string, string> = {
  wikipedia: 'Wikipedia',
  hn: 'Hacker News',
  bluesky: 'Bluesky',
};

/** «Historia larga»: one source at a time as an orange area, months back, with its peak. */
export function HistoryArea({
  series,
}: {
  series: { source: string; label: string; points: { date: string; value: number }[] }[];
}) {
  const usable = series.filter((s) => s.points.length > 1);
  const [pick, setPick] = useState(() => {
    // Start on the source with the most volume: the steadiest line.
    const sums = usable.map((u) => u.points.reduce((a, p) => a + p.value, 0));
    return Math.max(0, sums.indexOf(Math.max(...sums)));
  });
  const s = usable[Math.min(pick, usable.length - 1)];
  if (!s) return <p className="text-[0.92rem] text-ink-3">Sin historia larga para este tema.</p>;
  const width = 520;
  const height = 170;
  const max = Math.max(1, ...s.points.map((p) => p.value));
  const xy = s.points.map(
    (p, i) =>
      [(i * width) / (s.points.length - 1), height - 4 - (p.value / max) * (height - 14)] as const,
  );
  const line = xy
    .map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(' ');
  const peak = s.points.reduce((b, p, i) => (p.value > s.points[b]!.value ? i : b), 0);
  const first = new Date(s.points[0]!.date);
  const last = new Date(s.points.at(-1)!.date);
  const months = Math.max(1, Math.round((last.getTime() - first.getTime()) / (30.4 * 86_400_000)));
  const fmt = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <figure className="grid gap-3">
      {usable.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fuente">
          {usable.map((u, i) => (
            <button
              key={u.source}
              type="button"
              role="radio"
              aria-checked={u === s}
              onClick={() => setPick(i)}
              className={clsx(
                'h-10 rounded-[7px] border px-2.5 text-[0.8rem] transition lg:h-7',
                u === s
                  ? 'border-ink bg-ink font-[600] text-sheet'
                  : 'border-rule bg-sheet text-ink-2 hover:border-rule-strong',
              )}
            >
              {SOURCE_COPY[u.source] ?? u.source}
            </button>
          ))}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[170px] w-full text-marker-strong"
        aria-hidden
      >
        <path
          d={`${line} L${width},${height} L0,${height} Z`}
          className="fill-marker"
          fillOpacity={0.13}
        />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.84rem] text-ink-2">
        <span>{s.label}</span>
        <span>{months === 1 ? 'Último mes' : `Últimos ${months} meses`}</span>
        <span className="basis-full text-[0.78rem] text-ink-3">
          Pico: {fmtInt(s.points[peak]!.value)} el {fmt.format(new Date(s.points[peak]!.date))}
        </span>
      </figcaption>
    </figure>
  );
}
