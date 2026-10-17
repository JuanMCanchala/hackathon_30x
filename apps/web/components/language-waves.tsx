'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { fmtInt, waveY } from './ui';
import { LANGS, LANG_COPY, STAGE_COPY, type Lang, type RadarTopic, type Stage } from '@/lib/types';

/** Language hues on the sea (the hero is dark in both themes). Spanish is white: our language. */
const SEA_LANG: Record<Lang, string> = { en: '#b9b6ff', pt: '#8ce99a', es: '#ffffff' };
const STAGES: { stage: Stage; from: number; to: number }[] = [
  { stage: 'emergente', from: 0.04, to: 0.32 },
  { stage: 'crecimiento', from: 0.32, to: 0.56 },
  { stage: 'saturado', from: 0.56, to: 0.72 },
  { stage: 'declive', from: 0.72, to: 0.97 },
];
/** Where a topic sits on a lane where nobody has talked about it yet: the calm sea before it. */
const ABSENT_X = 0.015;

interface Dot {
  topic: RadarTopic;
  lang: Lang;
  x: number;
  y: number;
  absent: boolean;
}

/**
 * La ola viaja de idioma en idioma: three swells, English on top, Portuguese, then Spanish, and
 * each topic as a thread through them. A thread that leans left on its way down is a topic
 * already far along in English or Portuguese and still early in Spanish: the window to adapt it
 * first, drawn in orange.
 */
export function LanguageWaves({
  topics,
  numbered,
}: {
  topics: RadarTopic[];
  numbered: Map<string, number>;
}) {
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

  const narrow = width < 640;
  const labelW = narrow ? 30 : 96;
  const lane = narrow ? 74 : 96;
  const crest = narrow ? 18 : 22;
  const top = 18;
  const height = top + lane * 3 + 34;
  const x0 = labelW + 8;
  const x1 = width - 10;
  const xOf = (p: number) => x0 + p * (x1 - x0);
  const laneTop = (i: number) => top + i * lane;
  const yOf = (p: number, i: number) => waveY(p, laneTop(i) + lane - 14, laneTop(i) + crest);
  const radius = narrow ? 9 : 11;

  const dots: Dot[] = [];
  for (const topic of topics) {
    LANGS.forEach((lang, i) => {
      const w = topic.languages[lang];
      const absent = w.stage === 'ausente' || w.wavePos === null;
      const x = absent ? ABSENT_X : w.wavePos!;
      dots.push({ topic, lang, x: xOf(x), y: yOf(x, i), absent });
    });
  }
  // Nudge dots that collide on a lane, so every number stays readable.
  for (const lang of LANGS) {
    const onLane = dots.filter((d) => d.lang === lang).sort((a, b) => a.x - b.x);
    for (let i = 1; i < onLane.length; i++) {
      const prev = onLane[i - 1]!;
      const cur = onLane[i]!;
      if (cur.x - prev.x < radius * 2 + 3) cur.x = prev.x + radius * 2 + 3;
    }
  }
  const dotOf = (id: string, lang: Lang) => dots.find((d) => d.topic.id === id && d.lang === lang)!;
  const active = topics.find((t) => t.id === hover);

  return (
    <div ref={box} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block"
          role="img"
          aria-label="Cada tema en su ola en inglés, portugués y español"
        >
          {LANGS.map((lang, i) => {
            const points: string[] = [];
            for (let k = 0; k <= 100; k++)
              points.push(`${xOf(k / 100).toFixed(1)},${yOf(k / 100, i).toFixed(1)}`);
            return (
              <g key={lang}>
                <path
                  d={`M${points.join(' L')}`}
                  fill="none"
                  stroke={SEA_LANG[lang]}
                  strokeOpacity={lang === 'es' ? 0.85 : 0.6}
                  strokeWidth={lang === 'es' ? 2.6 : 2}
                />
                <text
                  x={4}
                  y={laneTop(i) + lane - 14}
                  fill={SEA_LANG[lang]}
                  fontSize={narrow ? 11 : 13}
                  fontWeight={700}
                >
                  {narrow ? lang.toUpperCase() : LANG_COPY[lang]}
                </text>
              </g>
            );
          })}
          {STAGES.map((s) => (
            <text
              key={s.stage}
              x={xOf((s.from + s.to) / 2)}
              y={height - 8}
              textAnchor="middle"
              fill="#ffffff"
              fillOpacity={0.55}
              fontSize={narrow ? 10.5 : 12}
              fontWeight={600}
            >
              {STAGE_COPY[s.stage]}
            </text>
          ))}
          {topics.map((t) => {
            const pts = LANGS.map((lang) => dotOf(t.id, lang));
            const open = t.spanishWindow.open;
            return (
              <polyline
                key={`thread-${t.id}`}
                points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={open ? '#ff6b2c' : '#ffffff'}
                strokeOpacity={hover && hover !== t.id ? 0.12 : open ? 0.9 : 0.3}
                strokeWidth={open ? 2.4 : 1.5}
                strokeDasharray={open ? undefined : '3 4'}
              />
            );
          })}
          {dots.map((d) => (
            <g
              key={`${d.topic.id}-${d.lang}`}
              role="link"
              tabIndex={d.lang === 'en' ? 0 : -1}
              aria-label={`${d.topic.name}: ${LANG_COPY[d.lang]}, ${d.absent ? 'todavía sin piezas' : `${fmtInt(d.topic.languages[d.lang].creators)} creadores`}`}
              className="cursor-pointer outline-none"
              opacity={hover && hover !== d.topic.id ? 0.35 : 1}
              onMouseEnter={() => setHover(d.topic.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.topic.id)}
              onBlur={() => setHover(null)}
              onClick={() => router.push(`/tema/${d.topic.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(`/tema/${d.topic.id}`);
              }}
            >
              <circle
                cx={d.x}
                cy={d.y}
                r={radius}
                fill={d.absent ? '#0d4a55' : SEA_LANG[d.lang]}
                stroke={d.absent ? SEA_LANG[d.lang] : '#0d4a55'}
                strokeWidth={d.absent ? 1.6 : 2.5}
                strokeDasharray={d.absent ? '2 2' : undefined}
              />
              <text
                x={d.x}
                y={d.y + 4}
                textAnchor="middle"
                fill={d.absent ? SEA_LANG[d.lang] : '#0c2730'}
                fontSize={narrow ? 10 : 11.5}
                fontWeight={800}
              >
                {numbered.get(d.topic.id)}
              </text>
            </g>
          ))}
        </svg>
      )}
      {active && (
        <div className="pointer-events-none absolute top-2 right-2 z-10 w-64 rounded-[14px] bg-white px-3.5 py-2.5 text-ink shadow-float">
          <p className="text-[0.95rem] leading-snug font-[700]">{active.name}</p>
          <p className="mt-1 text-[0.84rem] text-ink-2">
            {LANGS.map((l) => `${LANG_COPY[l]}: ${fmtInt(active.languages[l].creators)}`).join(
              '; ',
            )}{' '}
            creadores esta semana.
          </p>
          {active.spanishWindow.open && (
            <p className="mt-1 text-[0.84rem] font-[650] text-[#c2410c]">
              Ventana abierta en español.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
