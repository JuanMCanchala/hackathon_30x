import clsx from 'clsx';
import { PLATFORM_COPY, type Platform } from '@/lib/types';

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
