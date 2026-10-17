'use client';

import { fmtInt } from './ui';

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
