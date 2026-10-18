'use client';

import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { fmtGrowth, waveY } from './ui';
import { STAGE_COPY, type RadarTopic, type Stage } from '@/lib/types';

/** Where each stage's stretch starts on the wave (the API places topics inside these). */
const BANDS: { stage: Stage; from: number }[] = [
  { stage: 'emergente', from: 0 },
  { stage: 'crecimiento', from: 0.32 },
  { stage: 'saturado', from: 0.56 },
  { stage: 'declive', from: 0.72 },
];

/** The emergente stretch: an emerging topic that fits 30X is «Entra ya». */
const ZONE: [number, number] = [0.04, 0.32];

const STAGE_FG: Record<Stage, string> = {
  emergente: 'var(--st-emergente)',
  crecimiento: 'var(--st-crecimiento)',
  saturado: 'var(--st-saturado)',
  declive: 'var(--st-declive)',
  estable: 'var(--st-estable)',
};

const STAGE_DOT: Record<Stage, string> = {
  emergente: 'bg-st-emergente',
  crecimiento: 'bg-st-crecimiento',
  saturado: 'bg-st-saturado',
  declive: 'bg-st-declive',
  estable: 'bg-st-estable',
};

const CREST = 0.6;
const LABEL_SIZE = 11.5;
const ROW = 15;
const TIP = { x: 14, y: 34, w: 270, h: 62 };

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Label {
  x: number;
  y: number;
  anchor: 'start' | 'end';
  leader: boolean;
}

const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** A rough text width for 11.5 px semibold Hanken Grotesk: enough to keep labels apart. */
const textWidth = (s: string) => s.length * LABEL_SIZE * 0.56;

/**
 * Places each name next to its dot without overlapping the others: up and away from the curve
 * first (left on the rising side, right on the falling one), then under it, a row further each
 * time. A name that finds no room is left out; its dot still shows it on hover.
 */
function placeLabels(
  dots: { topic: RadarTopic; x: number; y: number; p: number }[],
  width: number,
  height: number,
  obstacles: Box[],
): Map<string, Label> {
  const placed: Box[] = [
    ...obstacles,
    ...dots.map((d) => ({ x0: d.x - 8, y0: d.y - 8, x1: d.x + 8, y1: d.y + 8 })),
  ];
  const out = new Map<string, Label>();
  for (const d of dots) {
    const w = textWidth(d.topic.name);
    const rising = d.p < CREST;
    const candidates: Label[] = [];
    for (let k = 0; k < 7; k++) {
      const up = d.y - 9 - k * ROW;
      const down = d.y + 18 + k * ROW;
      candidates.push(
        rising
          ? { x: d.x - 6, y: up, anchor: 'end', leader: k > 0 }
          : { x: d.x + 6, y: up, anchor: 'start', leader: k > 0 },
        rising
          ? { x: d.x + 9, y: down, anchor: 'start', leader: k > 0 }
          : { x: d.x - 9, y: down, anchor: 'end', leader: k > 0 },
      );
    }
    for (const c of candidates) {
      const x0 = c.anchor === 'end' ? c.x - w : c.x;
      const box = { x0: x0 - 3, y0: c.y - LABEL_SIZE, x1: x0 + w + 3, y1: c.y + 4 };
      if (box.x0 < 0 || box.x1 > width || box.y0 < 0 || box.y1 > height) continue;
      if (placed.some((b) => hits(b, box))) continue;
      placed.push(box);
      out.set(d.topic.id, c);
      break;
    }
  }
  return out;
}

/** The selected topic: name, growth and fit, and the way into its page. */
function TopicTip({ topic, className }: { topic: RadarTopic; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-[12px] border border-rule bg-sheet px-3.5 py-2.5 shadow-[0_8px_24px_rgb(32_21_21/0.10)]',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9rem] font-[700] text-ink">{topic.name}</p>
        <p className="mt-0.5 text-[0.78rem] text-ink-2">
          {topic.fresh ? 'Nuevo esta semana' : fmtGrowth(topic.growthPct)}
          {topic.fit != null && ` · encaje ${topic.fit}/10`}
        </p>
      </div>
      <Link
        href={`/tema/${topic.id}`}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[8px] bg-ink px-3 text-[0.82rem] font-[700] text-sheet hover:opacity-90"
      >
        Ver <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

/**
 * La onda: the lifecycle curve (emergente → en crecimiento → saturado → en declive) with each
 * topic as a dot where the radar places it. The shaded stretch is the «Entra ya» zone. Hover or
 * tap a dot to see the topic; on a phone the names go in a row of chips under the curve.
 */
export function RadarOnda({ topics }: { topics: RadarTopic[] }) {
  const router = useRouter();
  const gid = useId().replace(/:/g, '');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selected = topics.find((t) => t.id === selectedId) ?? topics[0];
  const narrow = width > 0 && width < 640;
  const H = narrow ? 210 : 300;
  const top = narrow ? 30 : 46;
  const base = H - (narrow ? 22 : 34);
  const padX = 6;
  const xOf = (p: number) => padX + p * (width - 2 * padX);
  const yOf = (p: number) => waveY(p, base, top);

  const points: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const p = i / 120;
    points.push(`${xOf(p).toFixed(1)},${yOf(p).toFixed(1)}`);
  }
  const line = `M${points.join(' L')}`;
  const area = `${line} L${xOf(1).toFixed(1)},${base} L${xOf(0).toFixed(1)},${base} Z`;

  const dots = topics.map((topic) => {
    const p = Math.min(0.99, Math.max(0.01, topic.wavePos));
    return { topic, p, x: xOf(p), y: yOf(p) };
  });
  const tipBox = { x0: TIP.x, y0: TIP.y, x1: TIP.x + TIP.w, y1: TIP.y + TIP.h };
  const labels = width && !narrow ? placeLabels(dots, width, H, [tipBox]) : new Map();
  const sel = dots.find((d) => d.topic.id === selected?.id);

  return (
    <div>
      <div ref={box} className="relative" style={{ height: H }}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            className="absolute inset-0 overflow-visible"
            role="img"
            aria-label="Ciclo de vida de los temas de la semana"
          >
            <defs>
              <linearGradient id={`${gid}-area`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--marker)', stopOpacity: 0.2 }} />
                <stop offset="100%" style={{ stopColor: 'var(--marker)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>

            {/* «Entra ya» zone */}
            <rect
              x={xOf(ZONE[0])}
              y={8}
              width={xOf(ZONE[1]) - xOf(ZONE[0])}
              height={base - 8}
              style={{ fill: 'var(--marker)', fillOpacity: 0.06 }}
            />
            <text
              x={xOf(ZONE[0]) + 6}
              y={22}
              className="font-mono"
              style={{ fill: 'var(--marker-strong)', fontSize: narrow ? 9 : 10, letterSpacing: 1 }}
            >
              ZONA «ENTRA YA»
            </text>

            {/* grid */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={width}
                y1={top + (base - top) * f}
                y2={top + (base - top) * f}
                strokeDasharray="3 5"
                style={{ stroke: 'var(--rule)' }}
              />
            ))}
            {BANDS.slice(1).map((b) => (
              <line
                key={b.stage}
                x1={xOf(b.from)}
                x2={xOf(b.from)}
                y1={8}
                y2={base}
                strokeDasharray="3 4"
                style={{ stroke: 'var(--rule-strong)', strokeOpacity: 0.7 }}
              />
            ))}
            <line x1={0} x2={width} y1={base} y2={base} style={{ stroke: 'var(--rule)' }} />

            {/* the wave */}
            <path d={area} fill={`url(#${gid}-area)`} />
            <path
              d={line}
              fill="none"
              strokeWidth={2.5}
              strokeLinecap="round"
              style={{ stroke: 'var(--marker)' }}
            />

            {/* leader lines and names */}
            {dots.map((d) => {
              const l = labels.get(d.topic.id);
              if (!l) return null;
              const on = d.topic.id === selected?.id;
              return (
                <g key={`l-${d.topic.id}`} className="pointer-events-none">
                  {l.leader && (
                    <line
                      x1={d.x}
                      y1={d.y}
                      x2={l.x}
                      y2={l.y - 4}
                      strokeWidth={1}
                      style={{ stroke: 'var(--rule-strong)' }}
                    />
                  )}
                  <text
                    x={l.x}
                    y={l.y}
                    textAnchor={l.anchor}
                    paintOrder="stroke"
                    strokeWidth={4}
                    strokeLinejoin="round"
                    style={{
                      fill: on ? 'var(--marker-strong)' : 'var(--ink)',
                      stroke: 'var(--sheet)',
                      fontSize: LABEL_SIZE,
                      fontWeight: on ? 700 : 600,
                    }}
                  >
                    {d.topic.name}
                  </text>
                </g>
              );
            })}

            {/* connector from the card to the selected dot */}
            {sel && !narrow && (
              <line
                x1={TIP.x + TIP.w}
                y1={TIP.y + TIP.h / 2}
                x2={sel.x}
                y2={sel.y}
                strokeDasharray="2 4"
                strokeWidth={1.2}
                style={{ stroke: 'var(--marker)', strokeOpacity: 0.55 }}
              />
            )}

            {/* dots */}
            {dots.map((d) => {
              const on = d.topic.id === selected?.id;
              return (
                <g
                  key={d.topic.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`${d.topic.name}: ${STAGE_COPY[d.topic.stage]}, ${fmtGrowth(d.topic.growthPct)}`}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setSelectedId(d.topic.id)}
                  onFocus={() => setSelectedId(d.topic.id)}
                  onClick={() =>
                    narrow && !on ? setSelectedId(d.topic.id) : router.push(`/tema/${d.topic.id}`)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') router.push(`/tema/${d.topic.id}`);
                  }}
                >
                  <circle cx={d.x} cy={d.y} r={14} fill="transparent" />
                  {on && (
                    <circle
                      cx={d.x}
                      cy={d.y}
                      r={15}
                      style={{ fill: 'var(--marker)', fillOpacity: 0.16 }}
                    />
                  )}
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={on ? 7.5 : 5.5}
                    strokeWidth={on ? 0 : 2.2}
                    style={{
                      fill: on ? 'var(--marker)' : 'var(--sheet)',
                      stroke: STAGE_FG[d.topic.stage],
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {/* the card sits in the calm stretch at the top left, where the curve never reaches */}
        {selected && !narrow && width > 0 && (
          <div
            className="absolute"
            style={{ left: TIP.x, top: TIP.y, width: TIP.w }}
            aria-live="polite"
          >
            <TopicTip topic={selected} />
          </div>
        )}
      </div>

      {/* stage legend, under the stretch each stage covers */}
      <div className="relative mt-3 hidden h-5 sm:block">
        {BANDS.map((b) => (
          <span
            key={b.stage}
            className="absolute inline-flex items-center gap-1.5 text-[0.78rem] font-[600] text-ink-2"
            style={{ left: `calc(${b.from * 100}% + ${b.from ? 8 : 6}px)` }}
          >
            <span className={clsx('size-2 rounded-full', STAGE_DOT[b.stage])} aria-hidden />
            {STAGE_COPY[b.stage]}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 sm:hidden">
        {BANDS.map((b) => (
          <span
            key={b.stage}
            className="inline-flex items-center gap-1.5 text-[0.76rem] font-[600] text-ink-2"
          >
            <span className={clsx('size-2 rounded-full', STAGE_DOT[b.stage])} aria-hidden />
            {STAGE_COPY[b.stage]}
          </span>
        ))}
      </div>

      {narrow && selected && (
        <div className="mt-4 grid gap-3">
          <TopicTip topic={selected} />
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={t.id === selected.id}
                onClick={() => setSelectedId(t.id)}
                className={clsx(
                  'rounded-[8px] border px-2.5 py-1 text-[0.8rem] transition',
                  t.id === selected.id
                    ? 'border-marker bg-marker/10 font-[650] text-ink'
                    : 'border-rule text-ink-2',
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
