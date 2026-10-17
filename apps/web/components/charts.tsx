'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { formatPercent, formatPeriodMonth, formatUsd } from '@mandato/domain';
import type { Overview } from '@/lib/types';

type Step = Overview['ladder'][number];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The trust ladder: share of bills decided without a person, per month, drawn as a staircase.
 * One series, so no legend box; each step is labelled directly; agreements signed in a month
 * are annotated on the riser that follows it. A table carries the same data for screen readers.
 */
export function TrustLadder({ steps }: { steps: Step[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 300;
  const pad = { top: 44, right: 16, bottom: 46, left: 40 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const n = Math.max(steps.length, 1);
  const stepW = innerW / n;
  const y = (v: number) => pad.top + innerH * (1 - v);
  const x = (i: number) => pad.left + i * stepW;

  // Each month is a tread with the riser that leads to it. The month in progress is dashed and
  // lighter: its share can still move until the month ends.
  const level = (i: number) => y(steps[i]!.autonomy);
  const treads = steps.map((s, i) => ({
    key: s.periodKey,
    open: s.inProgress,
    area: `M${x(i)} ${y(0)} L${x(i)} ${level(i)} L${x(i + 1)} ${level(i)} L${x(i + 1)} ${y(0)} Z`,
    line: `M${x(i)} ${level(i === 0 ? 0 : i - 1)} L${x(i)} ${level(i)} L${x(i + 1)} ${level(i)}`,
  }));
  const monthName = (s: Step) =>
    `${capitalize(formatPeriodMonth(s.periodKey))}${s.inProgress ? ' (en curso)' : ''}`;

  const description = steps
    .map(
      (s) =>
        `${monthName(s)}: ${formatPercent(s.autonomy)} sin intervención (${s.paidByAgent + s.heldByAgent} de ${s.total})`,
    )
    .join('; ');

  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Escalera de confianza. ${description}.`}
      >
        <defs>
          <linearGradient id="ladder-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brand)" stopOpacity={0.26} />
            <stop offset="1" stopColor="var(--brand)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--rule)"
              strokeWidth={1}
            />
            <text x={pad.left - 8} y={y(g) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">
              {Math.round(g * 100)}
            </text>
          </g>
        ))}
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />

        {treads.map((t) => (
          <path key={t.key} d={t.area} fill="url(#ladder-fill)" opacity={t.open ? 0.45 : 1} />
        ))}
        {treads.map((t) => (
          <path
            key={t.key}
            d={t.line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={t.open ? '6 6' : undefined}
          />
        ))}

        {steps.map((s, i) => {
          const cx = x(i);
          const top = y(s.autonomy);
          return (
            <g
              key={s.periodKey}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              role="listitem"
              aria-label={`${monthName(s)}: ${formatPercent(s.autonomy)}`}
              className="outline-none"
            >
              <rect x={cx} y={pad.top - 30} width={stepW} height={innerH + 30} fill="transparent" />
              {hover === i && (
                <rect
                  x={cx + 1}
                  y={top}
                  width={stepW - 2}
                  height={y(0) - top}
                  fill="var(--brand)"
                  opacity={0.08}
                />
              )}
              <text
                x={cx + 12}
                y={top - 12}
                className={clsx('t-figure text-[26px]', s.inProgress ? 'fill-ink-2' : 'fill-ink')}
              >
                {Math.round(s.autonomy * 100)}
                <tspan className="fill-ink-3 text-[15px]"> %</tspan>
              </text>
              <text
                x={cx + stepW / 2}
                y={H - pad.bottom + 22}
                textAnchor="middle"
                className="fill-ink-2 text-[13px] font-[560]"
              >
                {capitalize(formatPeriodMonth(s.periodKey))}
              </text>
              <text
                x={cx + stepW / 2}
                y={H - pad.bottom + 38}
                textAnchor="middle"
                className="fill-ink-3 text-[11.5px]"
              >
                {s.inProgress ? 'en curso: ' : ''}
                {s.paidByAgent + s.heldByAgent} de {s.total} sin intervención
              </text>
              {i < steps.length - 1 && s.signedInPeriod > 0 && (
                <g>
                  <circle
                    cx={x(i + 1)}
                    cy={(top + y(steps[i + 1]!.autonomy)) / 2}
                    r={5}
                    fill="var(--sheet)"
                    stroke="var(--brand)"
                    strokeWidth={2}
                  />
                  <text
                    x={x(i + 1) + 10}
                    y={(top + y(steps[i + 1]!.autonomy)) / 2 + 4}
                    className="fill-brand text-[12px] font-[640]"
                  >
                    +{s.signedInPeriod}{' '}
                    {s.signedInPeriod === 1 ? 'acuerdo firmado' : 'acuerdos firmados'}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {hover !== null && steps[hover] && (
        <div
          className="pointer-events-none absolute z-10 w-56 material rounded-[12px] px-3 py-2.5 text-sm shadow-float"
          style={{
            left: `${((x(hover) + stepW / 2) / W) * 100}%`,
            top: 8,
            transform: 'translateX(-50%)',
          }}
        >
          <p className="font-[620] text-ink">{monthName(steps[hover])}</p>
          <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-ink-2">
            <dt>Pagadas solas</dt>
            <dd className="text-right tabular-nums text-ink">{steps[hover].paidByAgent}</dd>
            <dt>Frenadas</dt>
            <dd className="text-right tabular-nums text-ink">{steps[hover].heldByAgent}</dd>
            <dt>Con aprobación</dt>
            <dd className="text-right tabular-nums text-ink">{steps[hover].escalated}</dd>
          </dl>
        </div>
      )}

      {/* A table can't be squeezed to 1px, so the wrapper is what hides it from sight. */}
      <div className="sr-only">
        <table>
          <caption>Escalera de confianza por mes</caption>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Decididas sin intervención</th>
              <th>Pagadas solas</th>
              <th>Frenadas</th>
              <th>Con aprobación</th>
              <th>Acuerdos firmados en el mes</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.periodKey}>
                <td>{monthName(s)}</td>
                <td>{formatPercent(s.autonomy)}</td>
                <td>{s.paidByAgent}</td>
                <td>{s.heldByAgent}</td>
                <td>{s.escalated}</td>
                <td>{s.signedInPeriod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Committed spend against the monthly budget. Overrun shows in the "frenada" color, labelled. */
export function BudgetMeter({ committed, budget }: { committed: number; budget: number }) {
  const ratio = budget > 0 ? committed / budget : 0;
  const within = Math.min(ratio, 1);
  const over = Math.max(0, ratio - 1);
  const remaining = budget - committed;
  return (
    <div>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-sheet-2 ring-1 ring-rule"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={committed}
        aria-label="Presupuesto comprometido del mes"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          style={{ width: `${(within / Math.max(1, ratio)) * 100}%` }}
        />
        {over > 0 && (
          <div
            className="absolute inset-y-0 rounded-r-full bg-held"
            style={{
              left: `${(1 / ratio) * 100}%`,
              width: `calc(${(over / ratio) * 100}% - 2px)`,
              marginLeft: 2,
            }}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="text-ink">
          <span className="t-figure">{formatUsd(committed)}</span>
          <span className="text-ink-3"> de {formatUsd(budget)}</span>
        </span>
        <span className={clsx(remaining < 0 ? 'text-held' : 'text-ink-2')}>
          {remaining >= 0
            ? `Quedan ${formatUsd(remaining)}`
            : `Excedido en ${formatUsd(-remaining)} con aprobación humana`}
        </span>
      </div>
    </div>
  );
}

const MIX = [
  { key: 'paidByAgent', label: 'Pagadas solas', color: 'var(--paid)', on: 'var(--on-paid)' },
  { key: 'heldByAgent', label: 'Frenadas', color: 'var(--held)', on: 'var(--on-held)' },
  { key: 'escalated', label: 'Con aprobación', color: 'var(--pending)', on: 'var(--on-pending)' },
] as const;

/** How each month was decided, as small multiples of one stacked bar (legend + direct counts). */
export function MonthMix({ steps }: { steps: Step[] }) {
  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2" aria-label="Leyenda">
        {MIX.map((m) => (
          <li key={m.key} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: m.color }} aria-hidden />
            {m.label}
          </li>
        ))}
      </ul>
      <ul className="grid gap-2.5">
        {steps.map((s) => (
          <li key={s.periodKey} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
            <span className="text-sm text-ink-2">
              {capitalize(formatPeriodMonth(s.periodKey))}
              {s.inProgress && <span className="block text-xs text-ink-3">en curso</span>}
            </span>
            <span
              className="flex h-6 gap-[2px]"
              role="img"
              aria-label={`${capitalize(formatPeriodMonth(s.periodKey))}${s.inProgress ? ' (en curso)' : ''}: ${MIX.map((m) => `${s[m.key]} ${m.label.toLowerCase()}`).join(', ')}`}
            >
              {MIX.map((m) =>
                s[m.key] > 0 ? (
                  <span
                    key={m.key}
                    className="flex items-center justify-end rounded-[4px] px-1.5 text-xs font-[650]"
                    style={{ flexGrow: s[m.key], flexBasis: 0, background: m.color, color: m.on }}
                    title={`${m.label}: ${s[m.key]}`}
                  >
                    {s[m.key]}
                  </span>
                ) : null,
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
