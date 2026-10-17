'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { fmtGrowth, fmtInt, waveY } from './ui';
import { STAGE_COPY, type RadarTopic, type Stage } from '@/lib/types';

/** Stage colors on the sea (the hero is dark in both themes): the light steps of each hue. */
const SEA_STAGE: Record<Stage, string> = {
  emergente: '#3cc7b6',
  crecimiento: '#7cb6f0',
  saturado: '#e2b54a',
  declive: '#9fb3b8',
  estable: '#9fb3b8',
};

/** Where each stage's stretch of the wave starts and ends. */
const PHASES: { stage: Stage; from: number; to: number }[] = [
  { stage: 'emergente', from: 0.04, to: 0.32 },
  { stage: 'crecimiento', from: 0.32, to: 0.56 },
  { stage: 'saturado', from: 0.56, to: 0.72 },
  { stage: 'declive', from: 0.72, to: 0.97 },
];

/** The stretch where entering pays off: the wave is forming or rising, not yet crowded. */
const WINDOW = { from: 0.06, to: 0.5 };

interface Placed {
  topic: RadarTopic;
  x: number;
  y: number;
  label: { x: number; y: number; w: number; above: boolean } | null;
}

const LABEL_FONT = 13;
const charWidth = LABEL_FONT * 0.56;

/** Places each topic on the wave and its label in the first free row above or below. */
function layout(
  topics: RadarTopic[],
  width: number,
  height: number,
  padX: number,
  top: number,
  base: number,
  withLabels: boolean,
): Placed[] {
  const xOf = (p: number) => padX + p * (width - 2 * padX);
  const rows: { x0: number; x1: number }[][] = [[], [], [], []];
  const offsets = [-34, -62, 34, 62];
  return [...topics]
    .sort((a, b) => a.wavePos - b.wavePos)
    .map((topic) => {
      const x = xOf(topic.wavePos);
      const y = waveY(topic.wavePos, base, top);
      if (!withLabels) return { topic, x, y, label: null };
      const text = topic.name.length > 26 ? `${topic.name.slice(0, 25)}…` : topic.name;
      const w = text.length * charWidth + 16;
      const x0 = Math.min(Math.max(x - w / 2, 4), width - w - 4);
      const row = offsets.findIndex((dy, i) => {
        const ly = y + dy;
        if (ly < 14 || ly > height - 14) return false;
        return rows[i]!.every((r) => x0 > r.x1 + 6 || x0 + w < r.x0 - 6);
      });
      if (row === -1) return { topic, x, y, label: null };
      rows[row]!.push({ x0, x1: x0 + w });
      return { topic, x, y, label: { x: x0, y: y + offsets[row]!, w, above: offsets[row]! < 0 } };
    });
}

/**
 * La ola: the lifecycle of a topic drawn as a wave, with this week's topics where they are on
 * it. Left of the crest they are forming or rising (the window to enter); at the crest everyone
 * already copied them; right of it they are going out.
 */
export function WaveChart({ topics }: { topics: RadarTopic[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = width < 720;
  const height = narrow ? 230 : 300;
  const padX = 12;
  const top = narrow ? 40 : 70;
  const base = height - 40;
  const xOf = (p: number) => padX + p * (width - 2 * padX);
  const points: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const p = i / 120;
    points.push(`${xOf(p).toFixed(1)},${waveY(p, base, top).toFixed(1)}`);
  }
  const line = `M${points.join(' L')}`;
  const area = `${line} L${xOf(1)},${base + 30} L${xOf(0)},${base + 30} Z`;
  const placed = width ? layout(topics, width, height, padX, top, base, !narrow) : [];
  const active = placed.find((p) => p.topic.id === hover);

  return (
    <div ref={box} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label="Los temas de la semana sobre la ola de su ciclo de vida"
        >
          <rect
            x={xOf(WINDOW.from)}
            y={top - 26}
            width={xOf(WINDOW.to) - xOf(WINDOW.from)}
            height={base - top + 56}
            rx={14}
            fill="#ff6b2c"
            fillOpacity={0.1}
            stroke="#ff6b2c"
            strokeOpacity={0.55}
            strokeDasharray="5 6"
          />
          <text
            x={xOf(WINDOW.from) + 12}
            y={top - 8}
            fill="#ffb08a"
            fontSize={12.5}
            fontWeight={700}
          >
            Ventana para entrar
          </text>
          <path d={area} fill="#ffffff" fillOpacity={0.06} />
          <path
            d={line}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.75}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {PHASES.slice(1).map((ph) => (
            <line
              key={ph.stage}
              x1={xOf(ph.from)}
              x2={xOf(ph.from)}
              y1={waveY(ph.from, base, top) + 8}
              y2={base + 22}
              stroke="#ffffff"
              strokeOpacity={0.18}
              strokeDasharray="2 5"
            />
          ))}
          {PHASES.map((ph) => (
            <text
              key={ph.stage}
              x={xOf((ph.from + ph.to) / 2)}
              y={base + 30}
              textAnchor="middle"
              fill="#ffffff"
              fillOpacity={0.62}
              fontSize={narrow ? 11 : 12.5}
              fontWeight={600}
            >
              {STAGE_COPY[ph.stage]}
            </text>
          ))}
          {placed.map(({ topic, x, y, label }) =>
            label ? (
              <g key={`l-${topic.id}`} className="pointer-events-none">
                <line
                  x1={x}
                  y1={y}
                  x2={x}
                  y2={label.above ? label.y + 10 : label.y - 10}
                  stroke="#ffffff"
                  strokeOpacity={0.35}
                />
                <rect
                  x={label.x}
                  y={label.y - 11}
                  width={label.w}
                  height={22}
                  rx={11}
                  fill="#06262d"
                  fillOpacity={hover === topic.id ? 0.95 : 0.78}
                />
                <text
                  x={label.x + label.w / 2}
                  y={label.y + 4.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={LABEL_FONT}
                  fontWeight={640}
                >
                  {topic.name.length > 26 ? `${topic.name.slice(0, 25)}…` : topic.name}
                </text>
              </g>
            ) : null,
          )}
          {placed.map(({ topic, x, y }) => (
            <g
              key={topic.id}
              role="link"
              tabIndex={0}
              aria-label={`${topic.rank}. ${topic.name}: ${STAGE_COPY[topic.stage]}, ${fmtGrowth(topic.growthPct)}`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHover(topic.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(topic.id)}
              onBlur={() => setHover(null)}
              onClick={() => router.push(`/tema/${topic.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(`/tema/${topic.id}`);
              }}
            >
              <circle
                cx={x}
                cy={y}
                r={narrow ? 11 : 13}
                fill={SEA_STAGE[topic.stage]}
                stroke="#0d4a55"
                strokeWidth={3}
              />
              {hover === topic.id && (
                <circle
                  cx={x}
                  cy={y}
                  r={narrow ? 15 : 18}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
              <text
                x={x}
                y={y + 4.2}
                textAnchor="middle"
                fill="#0c2730"
                fontSize={narrow ? 11 : 12}
                fontWeight={800}
              >
                {topic.rank}
              </text>
            </g>
          ))}
        </svg>
      )}
      {active && (
        <div
          className="pointer-events-none absolute z-10 w-60 rounded-[14px] bg-white px-3.5 py-2.5 text-ink shadow-float"
          style={{
            left: Math.min(Math.max(active.x - 120, 0), width - 240),
            top: active.y > height / 2 ? active.y - 112 : active.y + 24,
          }}
        >
          <p className="text-[0.95rem] leading-snug font-[700]">{active.topic.name}</p>
          <p className="mt-1 text-[0.84rem] text-ink-2">
            {STAGE_COPY[active.topic.stage]}, {fmtGrowth(active.topic.growthPct)} frente a su
            promedio, {fmtInt(active.topic.creators)} creadores esta semana.
          </p>
        </div>
      )}
    </div>
  );
}
