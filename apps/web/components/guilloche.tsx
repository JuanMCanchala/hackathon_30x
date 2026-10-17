/**
 * Guilloché rosettes, the anti-forgery engraving of cheques and banknotes. Each band is a
 * hypotrochoid (the rose-engine / spirograph curve) traced by a few nested lines, the way
 * an engraver repeats one cut with a slightly smaller stroke. Deterministic, so server and
 * client render the same markup.
 */
interface GuillocheProps {
  size?: number;
  /** Concentric bands, outermost first (1 to 3). */
  bands?: number;
  /** Nested lines per band. */
  lines?: number;
  className?: string;
  strokeWidth?: number;
}

interface BandSpec {
  /** Fixed circle to rolling circle ratio p/q, in lowest terms: p loops, closes after q turns. */
  p: number;
  q: number;
  /** Pen offset as a fraction of the rolling radius; below 1 gives smooth lenses, no cusps. */
  pen: number;
  /** Outer edge of the band, as a fraction of the rosette radius. */
  reach: number;
}

const BANDS: BandSpec[] = [
  { p: 36, q: 13, pen: 0.36, reach: 0.98 },
  { p: 24, q: 7, pen: 0.42, reach: 0.64 },
  { p: 15, q: 4, pen: 0.5, reach: 0.38 },
];

const cache = new Map<string, string>();

function hypotrochoid(radius: number, center: number, spec: BandSpec, shrink: number): string {
  const key = `${radius}|${center}|${spec.p}|${spec.q}|${spec.pen}|${spec.reach}|${shrink}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = spec.q / spec.p;
  const arm = 1 - r;
  const pen = spec.pen * r * shrink;
  const scale = (radius * spec.reach) / (arm + spec.pen * r);
  const steps = spec.p * 30;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * spec.q;
    const x = arm * Math.cos(t) + pen * Math.cos((arm / r) * t);
    const y = arm * Math.sin(t) - pen * Math.sin((arm / r) * t);
    d += `${i === 0 ? 'M' : 'L'}${(center + scale * x).toFixed(1)} ${(center + scale * y).toFixed(1)}`;
  }
  cache.set(key, d);
  return d;
}

export function Guilloche({
  size = 320,
  bands = 3,
  lines = 3,
  className,
  strokeWidth = 0.5,
}: GuillocheProps) {
  const c = size / 2;
  const paths: string[] = [];
  for (const spec of BANDS.slice(0, Math.max(1, Math.min(bands, BANDS.length)))) {
    for (let l = 0; l < lines; l++) {
      paths.push(hypotrochoid(c * 0.98, c, spec, 1 - l * 0.16));
    }
  }
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round">
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** Horizontal guilloché band, like the border of a cheque. */
export function GuillocheBand({
  width = 600,
  height = 44,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const paths: string[] = [];
  const waves = 7;
  for (let l = 0; l < waves; l++) {
    let d = '';
    const phase = (l / waves) * Math.PI;
    for (let x = 0; x <= width; x += 4) {
      const t = (x / width) * Math.PI * 2 * 9;
      const y = height / 2 + (height / 2.6) * Math.sin(t + phase) * Math.cos(t / 3.7 + phase / 2);
      d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`;
    }
    paths.push(d);
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={0.7}>
        {paths.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/** The mark: a single engraved band of nine lenses inside a banknote-green seal. */
const SEAL: BandSpec = { p: 9, q: 2, pen: 0.55, reach: 0.82 };

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <span className="relative inline-flex size-8 items-center justify-center rounded-full bg-brand text-on-brand">
        <svg
          viewBox="0 0 32 32"
          className="absolute inset-0 size-8"
          aria-hidden="true"
          focusable="false"
        >
          <g fill="none" stroke="currentColor" strokeWidth={0.6} opacity={0.85}>
            <path d={hypotrochoid(16, 16, SEAL, 1)} />
            <path d={hypotrochoid(16, 16, SEAL, 0.7)} />
          </g>
        </svg>
      </span>
      <span className="text-[1.3rem] leading-none font-[750] tracking-[-0.02em] [font-stretch:125%]">
        Mandato
      </span>
    </span>
  );
}
