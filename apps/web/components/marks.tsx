import clsx from 'clsx';
import { waveY, wavePath } from './ui';
import {
  LANGS,
  LANG_COPY,
  LANG_SHORT,
  PLATFORM_COPY,
  type Lang,
  type LanguageWave,
  type Platform,
} from '@/lib/types';

/** Eight weeks of distinct creators as a small swell; the last week is marked. */
export function Sparkline({
  values,
  className,
  width = 96,
  height = 28,
}: {
  values: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2)
    return <span className={clsx('inline-block', className)} style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const step = (width - 4) / (values.length - 1);
  const pts = values.map((v, i) => [2 + i * step, height - 3 - (v / max) * (height - 7)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.at(-1)![0]},${height} L${pts[0]![0]},${height} Z`;
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg
      width={width}
      height={height}
      className={clsx('shrink-0 text-brand', className)}
      aria-hidden
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lx} cy={ly} r={3} fill="currentColor" />
    </svg>
  );
}

/** Fit with 30X's audience: the score and five pips, so it reads at a glance and in words. */
export function FitMeter({ fit, className }: { fit: number | null; className?: string }) {
  if (fit === null) return <span className={clsx('text-sm text-ink-3', className)}>sin medir</span>;
  const filled = Math.round(fit / 2);
  return (
    <span
      className={clsx('inline-flex items-center gap-2', className)}
      title={`Encaje con 30X: ${fit} de 10`}
    >
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={clsx('h-2.5 w-1.5 rounded-full', i < filled ? 'bg-brand' : 'bg-rule-strong')}
          />
        ))}
      </span>
      <span className="t-figure text-[0.95rem] text-ink">
        {fit}
        <span className="text-ink-3">/10</span>
      </span>
    </span>
  );
}

export function PlatformChips({ platforms, max = 4 }: { platforms: Platform[]; max?: number }) {
  const shown = platforms.slice(0, max);
  const rest = platforms.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((p) => (
        <span
          key={p}
          className="rounded-full bg-fill px-2 py-0.5 text-[0.74rem] font-[600] whitespace-nowrap text-ink-2"
        >
          {PLATFORM_COPY[p]}
        </span>
      ))}
      {rest > 0 && <span className="px-1 text-[0.74rem] font-[600] text-ink-3">y {rest} más</span>}
    </span>
  );
}

/** The moment to publish: orange only for "Entra ya", the one call to act. */
export function TimingChip({ timing }: { timing: string }) {
  const now = timing === 'Entra ya';
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-[0.8rem] font-[700] whitespace-nowrap',
        now ? 'bg-marker text-on-marker' : 'bg-fill text-ink-2',
      )}
    >
      {timing}
    </span>
  );
}

/**
 * A growth seen in a single source: the backtest showed one source alone gives many false
 * alarms, so the radar says so instead of hiding it.
 */
export function UnconfirmedChip({ growingIn }: { growingIn: Platform[] }) {
  const where = growingIn.length
    ? `solo en ${growingIn.map((p) => PLATFORM_COPY[p]).join(', ')}`
    : 'en ninguna fuente por sí sola';
  return (
    <span
      className="inline-flex rounded-full border border-dashed border-rule-strong px-2 py-0.5 text-[0.72rem] font-[650] whitespace-nowrap text-ink-2"
      title={`Crece ${where}. Una sola fuente da muchas falsas alarmas: falta que lo confirme otra.`}
    >
      Por confirmar
    </span>
  );
}

const LANG_FG: Record<Lang, string> = {
  en: 'text-lang-en',
  pt: 'text-lang-pt',
  es: 'text-lang-es',
};

/**
 * A topic in its three languages: a tiny wave each, with a dot where the topic sits (hollow
 * when nobody has written about it yet) and its creators this week.
 */
export function LangTrio({
  languages,
  className,
}: {
  languages: Record<Lang, LanguageWave>;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex items-end gap-2.5', className)}>
      {LANGS.map((lang) => {
        const w = languages[lang];
        const absent = w.stage === 'ausente' || w.wavePos === null;
        const p = absent ? 0.02 : w.wavePos!;
        const x = 2 + p * 24;
        const y = waveY(p, 12, 2.5);
        return (
          <span
            key={lang}
            className="grid justify-items-center gap-0.5"
            title={`${LANG_COPY[lang]}: ${w.creators} creadores esta semana`}
          >
            <svg viewBox="0 0 28 14" className={clsx('h-3.5 w-7', LANG_FG[lang])} aria-hidden>
              <path
                d={wavePath(28, 12, 2.5, 2)}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.35}
                strokeWidth={1.6}
              />
              <circle
                cx={x}
                cy={y}
                r={2.8}
                fill={absent ? 'none' : 'currentColor'}
                stroke="currentColor"
                strokeWidth={absent ? 1.2 : 0}
              />
            </svg>
            <span className="t-figure text-[0.78rem] leading-none text-ink-2">
              <span className="sr-only">{LANG_COPY[lang]} </span>
              <span aria-hidden className="mr-0.5 text-[0.66rem] font-[700] text-ink-3">
                {LANG_SHORT[lang]}
              </span>
              {w.creators}
            </span>
          </span>
        );
      })}
    </span>
  );
}
