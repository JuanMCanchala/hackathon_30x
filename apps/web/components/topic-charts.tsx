'use client';

import clsx from 'clsx';
import { StageTag, fmtInt } from './ui';
import { LANGS, LANG_COPY, type Lang, type LanguageWave } from '@/lib/types';

/** Distinct creators per week as bars, the last week emphasized; a table backs it for readers. */
export function WeeklyBars({ weeks }: { weeks: { week: string; creators: number }[] }) {
  const max = Math.max(...weeks.map((w) => w.creators), 1);
  const fmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <figure className="grid gap-2">
      <div className="flex h-36 items-end gap-1.5" aria-hidden>
        {weeks.map((w, i) => {
          const last = i === weeks.length - 1;
          return (
            <div key={w.week} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[0.72rem] font-[700] whitespace-nowrap text-sheet opacity-0 transition group-hover:opacity-100">
                {fmtInt(w.creators)}
              </span>
              <span
                className={last ? 'rounded-t-[5px] bg-marker' : 'rounded-t-[5px] bg-brand/35'}
                style={{ height: `${Math.max(3, (w.creators / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 text-[0.7rem] text-ink-3" aria-hidden>
        {weeks.map((w, i) => (
          <span key={w.week} className="flex-1 text-center whitespace-nowrap">
            {i % 2 === weeks.length % 2 || i === weeks.length - 1
              ? fmt.format(new Date(w.week))
              : ''}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Creadores distintos por semana</caption>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <th>Semana que termina el {w.week}</th>
              <td>{w.creators}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A long series (days or weeks) as a quiet line with its peak marked. */
export function HistoryLine({
  points,
  label,
}: {
  points: { date: string; value: number }[];
  label: string;
}) {
  const width = 300;
  const height = 64;
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = width / (points.length - 1);
  const xy = points.map(
    (p, i) => [i * step, height - 4 - (p.value / max) * (height - 10)] as const,
  );
  const path = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const peak = points.reduce((best, p, i) => (p.value > points[best]!.value ? i : best), 0);
  const fmt = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <figure className="grid gap-1">
      <figcaption className="text-[0.82rem] text-ink-2">{label}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full text-brand"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={`${path} L${width},${height} L0,${height} Z`}
          fill="currentColor"
          fillOpacity={0.1}
        />
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-[0.76rem] text-ink-3">
        Pico: {fmtInt(points[peak]!.value)} el {fmt.format(new Date(points[peak]!.date))}
      </p>
    </figure>
  );
}

const LANG_MARK: Record<Lang, { fg: string; bg: string }> = {
  en: { fg: 'text-lang-en', bg: 'bg-lang-en' },
  pt: { fg: 'text-lang-pt', bg: 'bg-lang-pt' },
  es: { fg: 'text-lang-es', bg: 'bg-lang-es' },
};

/**
 * The topic's wave in each language, on one shared scale: a big English swell over a flat
 * Spanish line reads as what it is, room to adapt the idea first.
 */
export function LanguageCurves({
  languages,
  weeks,
}: {
  languages: Record<Lang, LanguageWave>;
  /** Week end dates, oldest first, aligned with each language's sparkline. */
  weeks: string[];
}) {
  const width = 320;
  const height = 52;
  const max = Math.max(1, ...LANGS.flatMap((l) => languages[l].sparkline));
  const fmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const n = languages.en.sparkline.length;
  const dated = weeks.length === n;
  const weekCopy = (i: number) =>
    i === n - 1
      ? 'esta semana'
      : dated
        ? `semana del ${fmt.format(new Date(weeks[i]!))}`
        : `hace ${n - 1 - i} semanas`;
  return (
    <figure className="grid">
      {LANGS.map((lang) => {
        const w = languages[lang];
        const step = width / Math.max(1, w.sparkline.length - 1);
        const xy = w.sparkline.map(
          (v, i) => [i * step, height - 3 - (v / max) * (height - 8)] as const,
        );
        const line = xy
          .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(' ');
        const lastY = xy.at(-1)?.[1] ?? height - 3;
        return (
          <div
            key={lang}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-rule py-3.5 first:border-t-0 first:pt-0 sm:grid-cols-[7rem_minmax(0,1fr)_11.5rem]"
          >
            <p className="flex items-center gap-2 font-[700] text-ink">
              <span className={clsx('h-[3px] w-4 rounded-full', LANG_MARK[lang].bg)} aria-hidden />
              {LANG_COPY[lang]}
            </p>
            <div className="relative col-span-2 h-[52px] sm:col-span-1 sm:row-start-1 sm:col-start-2">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
                className={clsx('absolute inset-0 h-full w-full', LANG_MARK[lang].fg)}
                aria-hidden
              >
                <line
                  x1={0}
                  x2={width}
                  y1={height - 3}
                  y2={height - 3}
                  stroke="var(--rule-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={`${line} L${width},${height} L0,${height} Z`}
                  fill="currentColor"
                  fillOpacity={0.14}
                />
                <path
                  d={line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span
                className={clsx(
                  'absolute right-0 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-sheet',
                  LANG_MARK[lang].bg,
                )}
                style={{ top: `${(lastY / height) * 100}%` }}
                aria-hidden
              />
              <div className="absolute inset-0 flex" aria-hidden>
                {w.sparkline.map((v, i) => (
                  <span key={i} className="group relative flex-1">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-ink/25 opacity-0 group-hover:opacity-100" />
                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-2 py-0.5 text-[0.72rem] font-[700] whitespace-nowrap text-sheet opacity-0 group-hover:opacity-100">
                      {fmtInt(v)} en {weekCopy(i)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-3">
              <span className="t-figure text-[1.2rem] leading-none text-ink">
                {fmtInt(w.creators)}
              </span>
              <span className="text-[0.8rem] text-ink-3">
                {w.creators === 1 ? 'creador' : 'creadores'}
              </span>
              {w.stage === 'ausente' || w.creators === 0 ? (
                <span className="text-[0.8rem] text-ink-3">todavía nadie</span>
              ) : (
                <StageTag stage={w.stage} />
              )}
            </div>
          </div>
        );
      })}
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-x-4 pt-1 text-[0.72rem] text-ink-3 sm:grid-cols-[7rem_minmax(0,1fr)_11.5rem]"
        aria-hidden
      >
        <span className="flex justify-between sm:col-start-2">
          <span>{dated ? fmt.format(new Date(weeks[0]!)) : `hace ${n - 1} semanas`}</span>
          <span>esta semana</span>
        </span>
      </div>
      <table className="sr-only">
        <caption>Creadores distintos por semana en cada idioma, de la más antigua a esta</caption>
        <tbody>
          {LANGS.map((lang) => (
            <tr key={lang}>
              <th>{LANG_COPY[lang]}</th>
              {languages[lang].sparkline.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
