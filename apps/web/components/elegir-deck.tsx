'use client';

/**
 * The cards of «Elegir»: the front card shows the best piece behind a topic (what already worked
 * in English or Portuguese), the two behind it are the next topics, fanned out. Our data has no
 * images, so each card wears its network's colors and OndAI's waves instead of a fake photo.
 */
import clsx from 'clsx';
import {
  Eye,
  FileText,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Newspaper,
  Play,
  Quote,
  Repeat2,
} from 'lucide-react';
import {
  useSyncExternalStore,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { fmtCompact } from './ui';
import { PLATFORM_COPY, type Piece, type Platform, type RadarTopic } from '@/lib/types';

/** A piece as the front card needs it: inspiration pieces carry their language and translation. */
export type DeckPiece = Piece & { lang?: 'en' | 'pt'; es?: string | null };

/** Base color, glow and accent per network: the card's «photo». */
const SKIN: Record<Platform, [string, string, string]> = {
  linkedin: ['#071a33', '#0a66c2', '#5fb2ff'],
  instagram: ['#2a0f3d', '#dd2a7b', '#f58529'],
  tiktok: ['#0b0b0f', '#fe2c55', '#25f4ee'],
  youtube: ['#1a0508', '#ff0033', '#ff7a59'],
  x: ['#0f1419', '#3a4550', '#8b98a5'],
  bluesky: ['#071c3d', '#1185fe', '#7cc4ff'],
  hn: ['#201515', '#ff6600', '#ffb070'],
  github: ['#0d1117', '#2f81f7', '#8957e5'],
  huggingface: ['#2a1f1d', '#ff9d00', '#ffd21e'],
  arxiv: ['#2a0808', '#b31b1b', '#ff8a7a'],
  news: ['#201515', '#ff4f00', '#c9b8ff'],
  newsletter: ['#1d1533', '#6b4fbb', '#ff8a5b'],
  producthunt: ['#2a0f08', '#da552f', '#ffb199'],
};

/** Layered gradients for a network: a glow top-left, an accent bottom-right, a dark base. */
export function skin(platform: Platform | undefined): CSSProperties {
  const [base, glow, accent] = SKIN[platform ?? 'news'];
  return {
    backgroundColor: base,
    backgroundImage: [
      `radial-gradient(120% 70% at 15% 10%, ${glow}cc 0%, transparent 60%)`,
      `radial-gradient(90% 60% at 95% 85%, ${accent}99 0%, transparent 65%)`,
      `linear-gradient(160deg, ${base} 0%, ${base} 100%)`,
    ].join(', '),
  };
}

/** OndAI's waves, drawn faintly over every card. */
function Waves() {
  return (
    <svg
      viewBox="0 0 280 460"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full text-white"
      aria-hidden
    >
      {Array.from({ length: 7 }, (_, i) => {
        const y = 120 + i * 26;
        return (
          <path
            key={i}
            d={`M-10 ${y} C 60 ${y - 40}, 120 ${y + 40}, 180 ${y} S 290 ${y - 30}, 300 ${y}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.05 + i * 0.012}
            strokeWidth={1.4}
          />
        );
      })}
    </svg>
  );
}

const FORMAT_COPY: Record<string, string> = {
  video: 'Video',
  reel: 'Reel',
  short: 'Short',
  post: 'Post',
  image: 'Imagen',
  carousel: 'Carrusel',
  news: 'Noticia',
  article: 'Artículo',
  thread: 'Hilo',
  newsletter: 'Newsletter',
  repo: 'Repositorio',
  paper: 'Paper',
  model: 'Modelo',
};

export function formatCopy(format: string): string {
  const known = FORMAT_COPY[format.toLowerCase()];
  if (known) return known;
  return format ? format.charAt(0).toUpperCase() + format.slice(1) : 'Pieza';
}

function FormatGlyph({ format }: { format: string }) {
  const f = format.toLowerCase();
  const Icon = ['video', 'reel', 'short'].includes(f)
    ? Play
    : f === 'news'
      ? Newspaper
      : ['image', 'carousel'].includes(f)
        ? ImageIcon
        : ['article', 'newsletter', 'paper'].includes(f)
          ? FileText
          : Quote;
  return (
    <span className="grid size-16 place-items-center rounded-full bg-white/85 text-[#201515] shadow-lg">
      <Icon className="size-6" fill={Icon === Play ? 'currentColor' : 'none'} aria-hidden />
    </span>
  );
}

// ------------------------------------------------------------------ time

const subscribeMinute = (cb: () => void) => {
  const t = setInterval(cb, 60_000);
  return () => clearInterval(t);
};
const nowMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

/** The current minute, client-only (null while rendering on the server). */
function useNow(): number | null {
  return useSyncExternalStore(subscribeMinute, nowMinute, () => null);
}

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function Metric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${value} ${label}`}>
      {icon}
      <span className="sr-only">{label}: </span>
      {fmtCompact(value)}
    </span>
  );
}

// ------------------------------------------------------------------ cards

const CARD =
  'relative w-[250px] sm:w-[280px] h-[420px] sm:h-[460px] overflow-hidden rounded-[22px] border-[3px] border-sheet shadow-float';

/** The front card: the piece that best shows the topic, as it ran in its own language. */
export function FrontCard({
  piece,
  topic,
  loading,
  style,
  className,
  ...rest
}: {
  piece: DeckPiece | null;
  topic: RadarTopic;
  loading?: boolean;
  style?: CSSProperties;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'>) {
  const now = useNow();
  const platform = piece?.platform ?? topic.platforms[0];
  const text = piece ? piece.hook || piece.title || piece.text : null;
  const meta = piece
    ? [
        formatCopy(piece.format),
        piece.platform === 'news' ? null : PLATFORM_COPY[piece.platform],
        piece.lang ? piece.lang.toUpperCase() : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <div
      className={clsx(CARD, 'touch-pan-y text-white select-none', className)}
      style={{ ...skin(platform), ...style }}
      {...rest}
    >
      <Waves />
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

      <div className="relative flex h-full flex-col p-4">
        {meta || !loading ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-[0.74rem] font-[700] backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-marker" aria-hidden />
            {meta ?? (platform ? PLATFORM_COPY[platform] : 'Tema')}
          </span>
        ) : (
          <span className="h-6 w-36 animate-pulse rounded-full bg-white/20" aria-hidden />
        )}

        <div className="grid flex-1 place-items-center pb-6">
          {piece && <FormatGlyph format={piece.format} />}
        </div>

        {!loading && !piece ? (
          <div className="grid gap-1.5">
            <p className="text-[1rem] font-[700]">{topic.name}</p>
            <p className="text-[0.82rem] text-white/75">
              Todavía no hay una pieza de muestra para este tema.
            </p>
          </div>
        ) : loading || !piece ? (
          <div className="grid gap-2" aria-label="Cargando la pieza">
            <span className="h-4 w-32 animate-pulse rounded bg-white/25" />
            <span className="h-3.5 w-full animate-pulse rounded bg-white/20" />
            <span className="h-3.5 w-4/5 animate-pulse rounded bg-white/20" />
          </div>
        ) : (
          <div className="grid gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-white/80 bg-white/20 text-[0.8rem] font-[700]">
                {piece.authorName.slice(0, 1).toUpperCase()}
              </span>
              <span className="truncate text-[0.88rem] font-[700]">{piece.authorName}</span>
            </div>
            <p
              lang={piece.lang}
              className="line-clamp-4 text-[0.9rem] leading-snug font-[500] text-white"
            >
              {text}
            </p>
            {piece.es && piece.lang && (
              <p className="line-clamp-2 text-[0.78rem] leading-snug text-white/70">
                <span className="font-[700] text-white/85">ES </span>
                {piece.es}
              </p>
            )}
            <div className="mt-0.5 flex items-center gap-3 text-[0.76rem] font-[700] text-white/90">
              {piece.likes ? (
                <Metric
                  icon={<Heart className="size-3.5" />}
                  value={piece.likes}
                  label="me gusta"
                />
              ) : piece.views ? (
                <Metric icon={<Eye className="size-3.5" />} value={piece.views} label="vistas" />
              ) : null}
              {piece.comments ? (
                <Metric
                  icon={<MessageCircle className="size-3.5" />}
                  value={piece.comments}
                  label="comentarios"
                />
              ) : null}
              {piece.shares ? (
                <Metric
                  icon={<Repeat2 className="size-3.5" />}
                  value={piece.shares}
                  label="compartidos"
                />
              ) : null}
              {now !== null && (
                <span className="ml-auto font-[600] text-white/75">
                  {ago(piece.publishedAt, now)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A card waiting behind the front one: the next topic, in its main network's colors. */
export function BackCard({ topic, className }: { topic: RadarTopic; className?: string }) {
  return (
    <div
      className={clsx(CARD, 'text-white', className)}
      style={skin(topic.platforms[0])}
      aria-hidden
    >
      <Waves />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
      <p className="absolute inset-x-4 bottom-5 line-clamp-2 text-[1rem] font-[700]">
        {topic.name}
      </p>
    </div>
  );
}
