/**
 * Maquetas: the team's post designs, Canva-style. A maqueta is a canvas (carousel, square post,
 * story, YouTube cover), a style (four colors, a type treatment, a texture and the brand) and its
 * slides, each with a layout. Slides are sized in container units, so one component is the
 * calendar's thumbnail, the editor's canvas and the 1080 px PNG a designer downloads.
 */
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import type {
  AdaptationContent,
  MaquetaFormat,
  MaquetaInput,
  MaquetaLayout,
  MaquetaOrigin,
  MaquetaSlide,
  MaquetaStyle,
} from '@/lib/types';

// ------------------------------------------------------------------ catalog

export const FORMAT_SPEC: Record<
  MaquetaFormat,
  { label: string; hint: string; width: number; height: number; multi: boolean; scale: number }
> = {
  carrusel: {
    label: 'Carrusel',
    hint: 'Instagram y LinkedIn, 4:5',
    width: 1080,
    height: 1350,
    multi: true,
    scale: 1,
  },
  post: {
    label: 'Post cuadrado',
    hint: 'Instagram y LinkedIn, 1:1',
    width: 1080,
    height: 1080,
    multi: false,
    scale: 0.95,
  },
  historia: {
    label: 'Historia o Reel',
    hint: 'Instagram y TikTok, 9:16',
    width: 1080,
    height: 1920,
    multi: true,
    scale: 1.05,
  },
  portada: {
    label: 'Portada de YouTube',
    hint: 'Miniatura, 16:9',
    width: 1280,
    height: 720,
    multi: false,
    scale: 0.72,
  },
};

export const FORMATS_ORDER: MaquetaFormat[] = ['carrusel', 'post', 'historia', 'portada'];

export const LAYOUT_COPY: Record<MaquetaLayout, { label: string; hint: string }> = {
  portada: { label: 'Portada', hint: 'El gancho, grande' },
  titular: { label: 'Titular', hint: 'Una idea y su explicación' },
  cifra: { label: 'Cifra', hint: 'Un número protagonista' },
  cita: { label: 'Cita', hint: 'Una frase entre comillas' },
  lista: { label: 'Lista', hint: 'Un punto por línea' },
  cierre: { label: 'Cierre', hint: 'La acción y la marca' },
};

export const LAYOUTS_ORDER: MaquetaLayout[] = [
  'portada',
  'titular',
  'cifra',
  'cita',
  'lista',
  'cierre',
];

type PresetStyle = Omit<MaquetaStyle, 'brand'>;

/** Starting points from OndAI's palette: a designer picks one, then changes anything. */
export const PRESETS: { id: string; name: string; style: PresetStyle }[] = [
  {
    id: 'onda',
    name: 'Onda naranja',
    style: {
      preset: 'onda',
      bg: '#ff4f00',
      ink: '#201515',
      accent: '#fffdf9',
      soft: '#ff8a52',
      font: 'hanken',
      headline: 'grueso',
      align: 'izquierda',
      texture: 'ondas',
    },
  },
  {
    id: 'crema',
    name: 'Crema editorial',
    style: {
      preset: 'crema',
      bg: '#fffdf9',
      ink: '#201515',
      accent: '#ff4f00',
      soft: '#ece7df',
      font: 'hanken',
      headline: 'fino',
      align: 'izquierda',
      texture: 'cuadricula',
    },
  },
  {
    id: 'noche',
    name: 'Noche',
    style: {
      preset: 'noche',
      bg: '#201515',
      ink: '#fffdf9',
      accent: '#ff4f00',
      soft: '#3d2e2b',
      font: 'hanken',
      headline: 'grueso',
      align: 'izquierda',
      texture: 'ondas',
    },
  },
  {
    id: 'lavanda',
    name: 'Lavanda',
    style: {
      preset: 'lavanda',
      bg: '#c1b7ff',
      ink: '#201515',
      accent: '#ff4f00',
      soft: '#d8d1ff',
      font: 'hanken',
      headline: 'grueso',
      align: 'izquierda',
      texture: 'avion',
    },
  },
  {
    id: 'arena',
    name: 'Arena técnica',
    style: {
      preset: 'arena',
      bg: '#efebe4',
      ink: '#201515',
      accent: '#3b33a8',
      soft: '#dcd5c8',
      font: 'mono',
      headline: 'grueso',
      align: 'izquierda',
      texture: 'cuadricula',
    },
  },
  {
    id: 'tinta',
    name: 'Tinta y lavanda',
    style: {
      preset: 'tinta',
      bg: '#14100f',
      ink: '#fffdf9',
      accent: '#c1b7ff',
      soft: '#2e2523',
      font: 'hanken',
      headline: 'fino',
      align: 'centro',
      texture: 'avion',
    },
  },
];

/** A preset with the team's brand on it. */
export function styleFrom(presetId: string, brand: MaquetaStyle['brand']): MaquetaStyle {
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]!;
  return { ...preset.style, brand };
}

// ------------------------------------------------------------------ composing from an adaptation

/** A figure worth a «Cifra» slide: «73 %», «10x», «US$ 4 mil», «3 de cada 5». */
const FIGURE =
  /(?:US\$|\$|€)\s?\d[\d.,]*\s?(?:mil(?:lones)?|k|M|B)?|\d+(?:[.,]\d+)?\s?(?:%|x|×|veces|mil(?:lones)?|k|M|B)(?![\p{L}\d])|\d+\s+de\s+cada\s+\d+/u;

function figureOf(text: string): string | null {
  const m = FIGURE.exec(text);
  return m ? m[0].trim() : null;
}

/** Several short lines, bullets or «1.» marks: a list. */
function looksLikeList(body: string): boolean {
  const lines = body
    .split(/\n|•|·|;|\s(?=\d[.)]\s)/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length >= 3 && lines.every((l) => l.length <= 90);
}

function listLines(body: string): string {
  return body
    .split(/\n|•|·|;|\s(?=\d[.)]\s)/)
    .map((l) => l.replace(/^\d[.)]\s*/, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** A middle slide's layout from what it says. */
function middleSlide(s: { title: string; body: string }, i: number): MaquetaSlide {
  if (/^[«"“]/.test(s.title.trim()))
    return {
      layout: 'cita',
      kicker: '',
      title: s.title.trim().replace(/^[«"“]|[»"”]$/g, ''),
      body: s.body,
    };
  const figure = figureOf(s.title);
  if (figure) {
    const rest = s.title.trim();
    const title = rest.startsWith(figure) ? rest.slice(figure.length).trim() : rest;
    return { layout: 'cifra', kicker: figure, title: title || rest, body: s.body };
  }
  if (looksLikeList(s.body))
    return { layout: 'lista', kicker: '', title: s.title, body: listLines(s.body) };
  return {
    layout: 'titular',
    kicker: String(i + 1).padStart(2, '0'),
    title: s.title,
    body: s.body,
  };
}

/**
 * The slides a format takes from an adaptation: the carousel's slides, the post's best hook, the
 * reel's beats as story frames, the YouTube title as the cover.
 */
export function slidesFromAdaptation(
  a: AdaptationContent,
  format: MaquetaFormat,
  topicName: string,
): MaquetaSlide[] {
  if (format === 'post')
    return [{ layout: 'portada', kicker: topicName, title: a.hooks[0] ?? a.angle, body: a.angle }];
  if (format === 'portada')
    return [{ layout: 'portada', kicker: '', title: a.youtube.title, body: '' }];
  if (format === 'historia') {
    const beats = a.reel.beats.slice(0, 10).map((b, i) => {
      const screen = a.reel.onScreen[i]?.trim();
      return middleSlide({ title: screen || b, body: screen ? b : '' }, i + 1);
    });
    return [
      { layout: 'portada', kicker: topicName, title: a.reel.hook, body: '' },
      ...beats,
      { layout: 'cierre', kicker: '', title: a.reel.cta, body: '' },
    ];
  }
  const slides = a.carousel.slice(0, 12);
  if (!slides.length)
    return [{ layout: 'portada', kicker: topicName, title: a.hooks[0] ?? a.angle, body: '' }];
  return slides.map((s, i) => {
    if (i === 0) return { layout: 'portada', kicker: topicName, title: s.title, body: s.body };
    if (i === slides.length - 1 && slides.length > 1)
      return { layout: 'cierre', kicker: '', title: s.title, body: s.body };
    return middleSlide(s, i);
  });
}

/**
 * New content in a maqueta someone already designed: the cover and the closing keep the
 * maqueta's layouts, the middle follows its rhythm unless the content asks for a figure or a list.
 */
export function slidesInMaqueta(
  template: Pick<MaquetaInput, 'slides'>,
  slides: MaquetaSlide[],
): MaquetaSlide[] {
  const first = template.slides[0]?.layout ?? 'portada';
  const last = template.slides.length > 1 ? template.slides.at(-1)!.layout : 'cierre';
  const middles = template.slides.slice(1, -1).map((s) => s.layout);
  return slides.map((s, i) => {
    if (i === 0) return { ...s, layout: first };
    if (i === slides.length - 1 && slides.length > 1) return { ...s, layout: last };
    if (s.layout === 'cifra' || s.layout === 'lista' || s.layout === 'cita' || !middles.length)
      return s;
    const wanted = middles[(i - 1) % middles.length]!;
    return wanted === 'cifra' || wanted === 'lista' || wanted === 'cita'
      ? s
      : { ...s, layout: wanted };
  });
}

/** What a maqueta says, as text to paste next to the images. */
export function maquetaText(m: Pick<MaquetaInput, 'slides'>): string {
  return m.slides
    .map((s, i) =>
      [`${i + 1}. ${s.kicker ? `${s.kicker} · ` : ''}${s.title}`, s.body]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');
}

/** A short name for a new maqueta: «Shadow AI · carrusel». */
export function maquetaName(origin: MaquetaOrigin | null, format: MaquetaFormat): string {
  const base = origin?.name ?? 'Maqueta';
  const label = FORMAT_SPEC[format].label;
  // «Portada de YouTube» keeps its capital Y: only the first letter goes down.
  return `${base.slice(0, 60)} · ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

// ------------------------------------------------------------------ drawing

/** Container-relative size, scaled per canvas so a YouTube cover is not all headline. */
const unit = (n: number, scale: number) => `${(n * scale).toFixed(2)}cqw`;

function titleSize(layout: MaquetaLayout, text: string): number {
  const n = text.length;
  if (layout === 'portada') return n <= 28 ? 11.5 : n <= 55 ? 9.2 : n <= 95 ? 7.4 : 6;
  if (layout === 'cita') return n <= 70 ? 6.8 : n <= 130 ? 5.6 : 4.6;
  return n <= 45 ? 7 : n <= 85 ? 5.9 : 4.9;
}

function Texture({
  style,
  format,
  layout,
}: {
  style: MaquetaStyle;
  format: MaquetaFormat;
  layout: MaquetaLayout;
}) {
  const { width: w, height: h } = FORMAT_SPEC[format];
  const bold = layout === 'portada' || layout === 'cierre';
  if (style.texture === 'ninguna') return null;
  if (style.texture === 'cuadricula') {
    const step = w / 12;
    const lines: ReactNode[] = [];
    for (let x = step; x < w; x += step)
      lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={h} />);
    for (let y = step; y < h; y += step)
      lines.push(<line key={`y${y}`} x1={0} y1={y} x2={w} y2={y} />);
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        <g stroke={style.soft} strokeWidth={w * 0.0018}>
          {lines}
        </g>
        {bold && <circle cx={w * 0.86} cy={h * 0.12} r={w * 0.035} fill={style.accent} />}
      </svg>
    );
  }
  if (style.texture === 'avion') {
    const s = w * (layout === 'portada' ? 0.42 : layout === 'cierre' ? 0.26 : 0.22);
    const x = w - s * 0.95;
    const y = h * 0.06;
    const pts = (list: [number, number][]) =>
      list.map(([px, py]) => `${x + (px / 104) * s},${y + (py / 80) * s}`).join(' ');
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden
      >
        <path
          d={`M ${w * 0.04} ${h * 0.97} C ${w * 0.3} ${h * 0.7}, ${w * 0.35} ${h * 0.35}, ${x + s * 0.05} ${y + s * 0.45}`}
          fill="none"
          stroke={style.soft}
          strokeWidth={w * 0.005}
          strokeDasharray={`${w * 0.014} ${w * 0.014}`}
          strokeLinecap="round"
        />
        <polygon
          points={pts([
            [4, 36],
            [98, 4],
            [56, 76],
          ])}
          fill={bold ? style.accent : style.soft}
        />
        <polyline
          points={pts([
            [98, 4],
            [44, 46],
            [56, 76],
          ])}
          fill="none"
          stroke={style.bg}
          strokeWidth={w * 0.006}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // Ondas: OndAI's thick wave crosses the cover and the closing; the inside slides keep a whisper.
  const wave = (y: number, amp: number, phase: number) => {
    const seg = w / 3;
    let d = `M ${-w * 0.1} ${y}`;
    for (let i = 0; i < 5; i++) {
      const x0 = -w * 0.1 + i * seg;
      const dir = (i + phase) % 2 === 0 ? -1 : 1;
      d += ` C ${x0 + seg * 0.35} ${y + dir * amp}, ${x0 + seg * 0.65} ${y + dir * amp}, ${x0 + seg} ${y}`;
    }
    return d;
  };
  // Measured from the footer, in the slide's own container units, so no canvas puts text on it.
  const cq = (w / 100) * FORMAT_SPEC[format].scale;
  const base = h - 22.1 * cq;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={wave(base - 1.4 * cq * (i + 1), 2.2 * cq, i)}
          fill="none"
          stroke={style.soft}
          strokeWidth={w * 0.004}
          opacity={bold ? 0.9 : 0.55}
        />
      ))}
      {bold && (
        <path
          d={wave(base, 3.2 * cq, 1)}
          fill="none"
          stroke={style.accent}
          strokeWidth={2.8 * cq}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function Footer({
  style,
  format,
  index,
  total,
}: {
  style: MaquetaStyle;
  format: MaquetaFormat;
  index: number;
  total: number;
}) {
  const spec = FORMAT_SPEC[format];
  const u = (n: number) => unit(n, spec.scale);
  const initials = style.brand.name.trim().slice(0, 3) || 'OK';
  const swipe = spec.multi && format === 'carrusel' && index === 0 && total > 1;
  return (
    <div
      className="relative z-[1] flex items-center justify-between"
      style={{ gap: u(2), fontSize: u(2.5) }}
    >
      <div className="flex min-w-0 items-center" style={{ gap: u(1.6) }}>
        {style.brand.logo && (
          <span
            className="grid shrink-0 place-items-center rounded-full font-[800]"
            style={{
              width: u(6.4),
              height: u(6.4),
              background: style.ink,
              color: style.bg,
              fontSize: u(2.2),
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-hanken), system-ui, sans-serif',
            }}
          >
            {initials}
          </span>
        )}
        <span className="min-w-0 truncate leading-tight">
          <span className="font-[700]">{style.brand.name}</span>
          {style.brand.handle && (
            <span
              className="ml-[0.6em] opacity-70"
              style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
            >
              {style.brand.handle}
            </span>
          )}
        </span>
      </div>
      {spec.multi && total > 1 && (
        <span
          className="shrink-0 tabular-nums opacity-75"
          style={{ fontFamily: 'var(--font-jetbrains), monospace' }}
        >
          {swipe ? 'Desliza →' : `${index + 1}/${total}`}
        </span>
      )}
    </div>
  );
}

/**
 * One slide of a maqueta. Fills its container's width at the canvas' aspect ratio; give it a
 * fixed width (1080 px for a carousel) to draw the exportable image.
 */
export function MaquetaSlideView({
  format,
  style,
  slide,
  index = 0,
  total = 1,
  className,
  rounded = true,
}: {
  format: MaquetaFormat;
  style: MaquetaStyle;
  slide: MaquetaSlide;
  index?: number;
  total?: number;
  className?: string;
  rounded?: boolean;
}) {
  const spec = FORMAT_SPEC[format];
  const u = (n: number) => unit(n, spec.scale);
  const center = style.align === 'centro';
  const mono = style.font === 'mono';
  const family = mono
    ? 'var(--font-jetbrains), ui-monospace, monospace'
    : 'var(--font-hanken), system-ui, sans-serif';
  const headline: CSSProperties = {
    fontSize: u(titleSize(slide.layout, slide.title)),
    fontWeight: style.headline === 'grueso' ? (mono ? 700 : 800) : 300,
    letterSpacing: mono ? '-0.04em' : style.headline === 'grueso' ? '-0.04em' : '-0.035em',
    lineHeight: style.headline === 'grueso' ? 1.02 : 1.06,
    textWrap: 'balance',
  };
  const body: CSSProperties = {
    fontSize: u(slide.body.length > 170 ? 3.15 : 3.7),
    lineHeight: 1.38,
    fontWeight: 400,
    opacity: 0.9,
    textWrap: 'pretty',
  };
  const kicker = slide.kicker.trim();
  const kickerEl = kicker ? (
    <p
      className="flex items-center"
      style={{
        fontFamily: 'var(--font-jetbrains), monospace',
        fontSize: u(2.6),
        letterSpacing: '0.04em',
        gap: u(1.2),
        justifyContent: center ? 'center' : 'flex-start',
      }}
    >
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: u(1.5), height: u(1.5), background: style.accent }}
      />
      <span className="min-w-0 truncate">{kicker}</span>
    </p>
  ) : null;

  let content: ReactNode;
  switch (slide.layout) {
    case 'portada':
      content = (
        <>
          {kickerEl}
          <div className="mt-auto grid" style={{ gap: u(3) }}>
            <h3 style={headline}>{slide.title}</h3>
            {slide.body && (
              <p style={{ ...body, maxWidth: center ? undefined : '88%' }}>{slide.body}</p>
            )}
          </div>
        </>
      );
      break;
    case 'cifra':
      content = (
        <div className="my-auto grid" style={{ gap: u(2.4) }}>
          <p
            className="tabular-nums"
            style={{
              color: style.accent,
              fontSize: u(kicker.length > 8 ? 15 : 22),
              fontWeight: mono ? 700 : 800,
              letterSpacing: '-0.05em',
              lineHeight: 0.92,
            }}
          >
            {kicker || '—'}
          </p>
          <h3
            style={{ ...headline, fontSize: u(Math.min(titleSize('titular', slide.title), 6.2)) }}
          >
            {slide.title}
          </h3>
          {slide.body && <p style={body}>{slide.body}</p>}
        </div>
      );
      break;
    case 'cita':
      content = (
        <div className="my-auto grid" style={{ gap: u(2.6) }}>
          <p
            aria-hidden
            style={{
              color: style.accent,
              fontSize: u(20),
              fontWeight: 800,
              lineHeight: 0.6,
              height: u(10),
            }}
          >
            “
          </p>
          <h3 style={headline}>{slide.title}</h3>
          {slide.body && (
            <p
              style={{
                ...body,
                fontFamily: 'var(--font-jetbrains), monospace',
                fontSize: u(2.7),
                opacity: 0.8,
              }}
            >
              {slide.body}
            </p>
          )}
        </div>
      );
      break;
    case 'lista': {
      const lines = slide.body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 7);
      content = (
        <div className="my-auto grid" style={{ gap: u(3.4) }}>
          {kickerEl}
          <h3
            style={{ ...headline, fontSize: u(Math.min(titleSize('titular', slide.title), 6.4)) }}
          >
            {slide.title}
          </h3>
          <ol className="grid" style={{ gap: u(1.6), textAlign: 'left' }}>
            {lines.map((line, i) => (
              <li
                key={`${i}-${line}`}
                className="grid items-baseline"
                style={{
                  gridTemplateColumns: `${u(6)} 1fr`,
                  borderTop: `${u(0.25)} solid ${style.soft}`,
                  paddingTop: u(1.6),
                  fontSize: u(lines.length > 5 ? 3.1 : 3.5),
                  lineHeight: 1.3,
                }}
              >
                <span
                  className="tabular-nums"
                  style={{
                    color: style.accent,
                    fontFamily: 'var(--font-jetbrains), monospace',
                    fontWeight: 700,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>
      );
      break;
    }
    case 'cierre':
      content = (
        <div
          className="my-auto grid"
          style={{ gap: u(3), justifyItems: center ? 'center' : 'start' }}
        >
          {kickerEl}
          <h3 style={headline}>{slide.title}</h3>
          {slide.body && <p style={body}>{slide.body}</p>}
          {style.brand.handle && (
            <span
              className="inline-flex items-center rounded-full font-[700]"
              style={{
                background: style.accent,
                color: style.bg,
                fontSize: u(2.9),
                padding: `${u(1.6)} ${u(3.4)}`,
                marginTop: u(1),
              }}
            >
              Síguenos en {style.brand.handle}
            </span>
          )}
        </div>
      );
      break;
    default:
      content = (
        <div className="my-auto grid" style={{ gap: u(3) }}>
          {kickerEl}
          <h3 style={headline}>{slide.title}</h3>
          {slide.body && <p style={body}>{slide.body}</p>}
        </div>
      );
  }

  const bottomRoom =
    (slide.layout === 'portada' || slide.layout === 'cierre') && style.texture === 'ondas';
  return (
    <div
      className={clsx(
        'relative isolate w-full overflow-hidden',
        rounded && 'rounded-[3%]',
        className,
      )}
      style={{
        aspectRatio: `${spec.width} / ${spec.height}`,
        containerType: 'inline-size',
        background: style.bg,
        color: style.ink,
        fontFamily: family,
      }}
    >
      <Texture style={style} format={format} layout={slide.layout} />
      <div
        className="relative z-[1] flex h-full flex-col"
        style={{
          padding: `${u(7)} ${u(7)} ${u(5.5)}`,
          textAlign: center ? 'center' : 'left',
          alignItems: center ? 'center' : 'stretch',
          gap: u(3),
        }}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{ paddingBottom: bottomRoom ? u(14) : 0, width: '100%' }}
        >
          {content}
        </div>
        <div style={{ width: '100%' }}>
          <Footer style={style} format={format} index={index} total={total} />
        </div>
      </div>
    </div>
  );
}

/** The first slide, small: for lists, the calendar and the post deck. */
export function MaquetaThumb({
  maqueta,
  className,
}: {
  maqueta: Pick<MaquetaInput, 'format' | 'style' | 'slides'>;
  className?: string;
}) {
  const first = maqueta.slides[0];
  if (!first) return null;
  return (
    <MaquetaSlideView
      format={maqueta.format}
      style={maqueta.style}
      slide={first}
      index={0}
      total={maqueta.slides.length}
      className={className}
    />
  );
}

// ------------------------------------------------------------------ export

/**
 * Every slide at its real size, out of sight, for the PNG export. Render it only while exporting
 * and pass the wrapper's ref to downloadSlides.
 */
export function MaquetaExportStage({
  maqueta,
  stageRef,
}: {
  maqueta: Pick<MaquetaInput, 'format' | 'style' | 'slides'>;
  stageRef: (el: HTMLDivElement | null) => void;
}) {
  const spec = FORMAT_SPEC[maqueta.format];
  return (
    <div
      ref={stageRef}
      aria-hidden
      className="pointer-events-none fixed top-0 left-[-20000px]"
      style={{ width: spec.width }}
    >
      {maqueta.slides.map((s, i) => (
        <div key={i} data-slide={i} style={{ width: spec.width }}>
          <MaquetaSlideView
            format={maqueta.format}
            style={maqueta.style}
            slide={s}
            index={i}
            total={maqueta.slides.length}
            rounded={false}
          />
        </div>
      ))}
    </div>
  );
}

/** Downloads the stage's slides as PNG files («nombre-1.png», …); `only` picks one slide. */
export async function downloadSlides(stage: HTMLElement, baseName: string, only?: number) {
  const { toPng } = await import('html-to-image');
  const nodes = [...stage.querySelectorAll<HTMLElement>('[data-slide]')].filter(
    (_, i) => only === undefined || i === only,
  );
  const safe =
    baseName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'maqueta';
  for (const node of nodes) {
    const n = Number(node.dataset.slide) + 1;
    const url = await toPng(node, { pixelRatio: 1, cacheBust: true });
    const a = document.createElement('a');
    a.href = url;
    a.download = nodes.length > 1 || only !== undefined ? `${safe}-${n}.png` : `${safe}.png`;
    a.click();
  }
}
