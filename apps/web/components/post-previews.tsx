'use client';

/**
 * The posts a caught piece turns into, drawn the way each network shows them: one LinkedIn post
 * per hook, the Instagram carousel, the Reel or TikTok cover with its script and the YouTube
 * video. The images are the team's maquetas (components/maqueta), so what the team keeps here is
 * what «Armar maqueta» opens.
 */
import clsx from 'clsx';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Ellipsis,
  Globe,
  Heart,
  MessageCircle,
  MessageSquare,
  Music2,
  Play,
  Repeat2,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { textOf } from './adaptation-panel';
import { MaquetaSlideView, slidesFromAdaptation, styleFrom } from './maqueta';
import { stampOf } from '@/lib/post-decisions';
import type {
  AdaptationContent,
  MaquetaFormat,
  MaquetaSlide,
  MaquetaStyle,
  PieceFormat,
} from '@/lib/types';

// ------------------------------------------------------------------ the cards

export type PostKind = 'linkedin' | 'carrusel' | 'reel' | 'youtube';

export interface PostCard {
  /** Stable within an adaptation: «linkedin-0», «carrusel», «reel», «youtube». */
  id: string;
  kind: PostKind;
  /** The format the calendar schedules. */
  format: PieceFormat;
  /** The maqueta canvas «Armar maqueta» opens. */
  canvas: MaquetaFormat;
  /** «LinkedIn», «Carrusel de Instagram»… */
  name: string;
  /** «gancho 2 de 3», «7 láminas»… */
  detail: string;
  /** The line the list of kept posts shows. */
  first: string;
  /** Everything to paste. */
  text: string;
  /** LinkedIn: which of the three hooks opens the post. */
  hook?: number;
}

/** The team as the posts sign: name on LinkedIn and YouTube, handle on Instagram. */
export interface PostBrand {
  name: string;
  /** «@crece30x»; may be empty. */
  handle: string;
  /** The line under the name on LinkedIn. */
  tagline: string;
}

/** The series of posts an adaptation makes: three LinkedIn hooks, carousel, reel, YouTube. */
export function postCardsFrom(a: AdaptationContent): PostCard[] {
  // Each card keeps its hook's text and its place in `hooks`, even if one came back empty.
  const hooks = a.hooks
    .map((text, at) => ({ text: text.trim(), at }))
    .filter((h) => h.text)
    .slice(0, 3);
  const opening = hooks.length ? hooks : [{ text: a.angle.trim(), at: 0 }];
  const cards: PostCard[] = opening.map((h, i) => ({
    id: `linkedin-${i}`,
    kind: 'linkedin',
    format: 'linkedin',
    canvas: 'post',
    name: 'LinkedIn',
    detail: opening.length > 1 ? `gancho ${i + 1} de ${opening.length}` : 'post',
    first: h.text,
    text: `${h.text}\n\n${a.linkedin}`,
    hook: h.at,
  }));
  if (a.carousel.length)
    cards.push({
      id: 'carrusel',
      kind: 'carrusel',
      format: 'carousel',
      canvas: 'carrusel',
      name: 'Carrusel de Instagram',
      detail: `${a.carousel.length} ${a.carousel.length === 1 ? 'lámina' : 'láminas'}`,
      first: a.carousel[0]!.title,
      text: textOf(a, 'carousel'),
    });
  cards.push({
    id: 'reel',
    kind: 'reel',
    format: 'reel',
    canvas: 'historia',
    name: 'Reel o TikTok',
    detail: a.reel.beats.length
      ? `guion de ${a.reel.beats.length} ${a.reel.beats.length === 1 ? 'toma' : 'tomas'}`
      : 'guion',
    first: a.reel.hook,
    text: textOf(a, 'reel'),
  });
  cards.push({
    id: 'youtube',
    kind: 'youtube',
    format: 'youtube',
    canvas: 'portada',
    name: 'YouTube',
    detail: 'video',
    first: a.youtube.title,
    text: textOf(a, 'youtube'),
  });
  return cards;
}

/** The adaptation's fingerprint: decisions made on it stop counting if it is rewritten. */
export function stampOfAdaptation(a: AdaptationContent): string {
  return stampOf([a.angle, ...a.hooks, a.linkedin, a.youtube.title].join('\n'));
}

/** The maqueta style every preview wears: OndAI's orange with the team's name and handle. */
export function previewStyle(brand: PostBrand): MaquetaStyle {
  return styleFrom('onda', { name: brand.name, handle: brand.handle, logo: true });
}

/** The slides a card's image shows, on its canvas. */
export function slidesOf(card: PostCard, a: AdaptationContent, term: string): MaquetaSlide[] {
  if (card.kind === 'linkedin') {
    const [post] = slidesFromAdaptation(a, 'post', term);
    return [{ ...post!, title: card.first }];
  }
  return slidesFromAdaptation(a, card.canvas, term);
}

// ------------------------------------------------------------------ small parts

const IG_GRADIENT =
  'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285aeb 90%)';

/** The network's mark, drawn small: these previews say where each post lives. */
export function NetworkMark({ kind, className }: { kind: PostKind; className?: string }) {
  const box = clsx('grid size-[18px] shrink-0 place-items-center', className);
  if (kind === 'linkedin')
    return (
      <span
        className={clsx(box, 'rounded-[4px] bg-[#0a66c2] text-[11px] leading-none font-[800]')}
        style={{ color: '#fff' }}
        aria-hidden
      >
        in
      </span>
    );
  if (kind === 'carrusel')
    return (
      <span className={clsx(box, 'rounded-[5px]')} style={{ background: IG_GRADIENT }} aria-hidden>
        <svg viewBox="0 0 24 24" className="size-[14px]" fill="none" stroke="#fff" strokeWidth={2}>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.6" />
          <circle cx="16.8" cy="7.2" r="0.6" fill="#fff" />
        </svg>
      </span>
    );
  if (kind === 'youtube')
    return (
      <svg viewBox="0 0 24 24" className={clsx('size-[18px] shrink-0', className)} aria-hidden>
        <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#ff0033" />
        <path d="M10 8.7v6.6l5.7-3.3z" fill="#fff" />
      </svg>
    );
  return (
    <span className={clsx(box, 'rounded-[5px] bg-[#201515] ring-1 ring-white/15')} aria-hidden>
      <Clapperboard className="size-3" style={{ color: '#fff' }} strokeWidth={2.4} />
    </span>
  );
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full bg-ink leading-none font-[750] tracking-[-0.02em] text-sheet',
        className,
      )}
      aria-hidden
    >
      {name.trim().slice(0, 3) || 'OK'}
    </span>
  );
}

/** The card's top strip: which network, and which version of the post. */
function Band({ card }: { card: PostCard }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-rule bg-sheet-2 px-3.5">
      <NetworkMark kind={card.kind} />
      <span className="text-[0.8rem] font-[700] whitespace-nowrap text-ink">{card.name}</span>
      <span className="min-w-0 truncate text-[0.78rem] text-ink-3">· {card.detail}</span>
    </div>
  );
}

/**
 * A canvas that takes what the card has left, at its own ratio, on its own color: on a short
 * card the slide shrinks instead of pushing the rest out.
 */
function FitCanvas({ ratio, bg, children }: { ratio: number; bg: string; children: ReactNode }) {
  return (
    <div
      className="grid min-h-0 flex-1 place-items-center overflow-hidden"
      style={{ background: bg, containerType: 'size' }}
    >
      <div style={{ width: `min(100cqw, calc(100cqh * ${ratio}))` }}>{children}</div>
    </div>
  );
}

const mono = 'font-mono text-[0.66rem] tracking-[0.08em] text-ink-3 uppercase';

// ------------------------------------------------------------------ LinkedIn

const LINKEDIN_BAR = [
  { icon: ThumbsUp, label: 'Recomendar' },
  { icon: MessageSquare, label: 'Comentar' },
  { icon: Repeat2, label: 'Compartir' },
  { icon: Send, label: 'Enviar' },
];

function LinkedInPost({
  hook,
  a,
  brand,
  style,
  slide,
}: {
  hook: string;
  a: AdaptationContent;
  brand: PostBrand;
  style: MaquetaStyle;
  slide: MaquetaSlide;
}) {
  const [more, setMore] = useState(false);
  const image = <MaquetaSlideView format="post" style={style} slide={slide} rounded={false} />;
  return (
    <div
      className={clsx('flex min-h-0 flex-1 flex-col', more && 'overflow-y-auto overscroll-contain')}
    >
      <div className="flex shrink-0 items-center gap-2.5 px-3.5 pt-3">
        <Avatar name={brand.name} className="size-10 text-[0.74rem]" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[0.86rem] font-[700] text-ink">{brand.name}</p>
          {brand.tagline && <p className="truncate text-[0.72rem] text-ink-3">{brand.tagline}</p>}
          <p className="flex items-center gap-1 text-[0.72rem] text-ink-3">
            Ahora ·
            <Globe className="size-3" aria-label="Público" />
          </p>
        </div>
        <Ellipsis className="size-4 shrink-0 text-ink-3" aria-hidden />
      </div>
      <div className="shrink-0 px-3.5 pt-2 pb-2.5 text-[0.84rem] leading-[1.45] text-ink">
        <p className="font-[700]">{hook}</p>
        <p className={clsx('mt-1 whitespace-pre-line', !more && 'line-clamp-2')}>{a.linkedin}</p>
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="text-[0.8rem] font-[650] text-ink-3 hover:text-ink hover:underline"
        >
          {more ? 'ver menos' : '…ver más'}
        </button>
      </div>
      {more ? (
        <div className="shrink-0">{image}</div>
      ) : (
        <FitCanvas ratio={1} bg={style.bg}>
          {image}
        </FitCanvas>
      )}
      <div
        className="grid shrink-0 grid-cols-4 border-t border-rule px-1 py-1.5 text-[0.72rem] font-[650] text-ink-2"
        aria-hidden
      >
        {LINKEDIN_BAR.map(({ icon: I, label }) => (
          <span key={label} className="inline-flex items-center justify-center gap-1 py-1">
            <I className="size-4" />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Instagram

const arrow =
  'absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#201515] shadow-md transition hover:bg-white';

function InstagramCarousel({
  a,
  brand,
  style,
  slides,
}: {
  a: AdaptationContent;
  brand: PostBrand;
  style: MaquetaStyle;
  slides: MaquetaSlide[];
}) {
  const [index, setIndex] = useState(0);
  const at = Math.min(index, slides.length - 1);
  const user = brand.handle.replace(/^@/, '') || brand.name;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 px-3 py-2">
        <span className="rounded-full p-[2px]" style={{ background: IG_GRADIENT }}>
          <Avatar name={brand.name} className="size-7 text-[0.56rem] ring-2 ring-sheet" />
        </span>
        <p className="min-w-0 flex-1 truncate text-[0.82rem] font-[700] text-ink">{user}</p>
        <Ellipsis className="size-4 shrink-0 text-ink-2" aria-hidden />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <FitCanvas ratio={0.8} bg={style.bg}>
          <MaquetaSlideView
            format="carrusel"
            style={style}
            slide={slides[at]!}
            index={at}
            total={slides.length}
            rounded={false}
          />
        </FitCanvas>
        <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[0.7rem] font-[650] text-white tabular-nums">
          {at + 1}/{slides.length}
        </span>
        {at > 0 && (
          <button
            type="button"
            onClick={() => setIndex(at - 1)}
            aria-label="Lámina anterior"
            className={clsx(arrow, 'left-2')}
          >
            <ChevronLeft className="size-4" strokeWidth={2.6} aria-hidden />
          </button>
        )}
        {at < slides.length - 1 && (
          <button
            type="button"
            onClick={() => setIndex(at + 1)}
            aria-label="Lámina siguiente"
            className={clsx(arrow, 'right-2')}
          >
            <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
          </button>
        )}
      </div>
      <div className="relative flex shrink-0 items-center gap-3.5 px-3 pt-2 pb-1 text-ink">
        <Heart className="size-[19px]" aria-hidden />
        <MessageCircle className="size-[19px]" aria-hidden />
        <Send className="size-[19px]" aria-hidden />
        <span className="absolute left-1/2 flex -translate-x-1/2 gap-[3px]" aria-hidden>
          {slides.map((_, k) => (
            <span
              key={k}
              className={clsx('size-[5px] rounded-full', k === at ? 'bg-[#0095f6]' : 'bg-ink-3/45')}
            />
          ))}
        </span>
        <Bookmark className="ml-auto size-[19px]" aria-hidden />
      </div>
      <p className="mx-3 mb-2.5 line-clamp-2 shrink-0 text-[0.78rem] leading-snug text-ink">
        <span className="font-[700]">{user}</span> {a.angle}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ Reel o TikTok

/** How many takes the card lists; the rest are in «Ver todo el texto». */
const BEATS_SHOWN = 6;

function ReelScript({
  a,
  brand,
  style,
  frames,
}: {
  a: AdaptationContent;
  brand: PostBrand;
  style: MaquetaStyle;
  frames: MaquetaSlide[];
}) {
  const beats = a.reel.beats.slice(0, BEATS_SHOWN);
  const extra = a.reel.beats.length - beats.length;
  const user = brand.handle.replace(/^@/, '') || brand.name;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
      <div className="flex shrink-0 gap-3">
        <div className="relative w-[104px] shrink-0 overflow-hidden rounded-[10px] sm:w-[124px]">
          <MaquetaSlideView
            format="historia"
            style={style}
            slide={frames[0]!}
            index={0}
            total={frames.length}
            rounded={false}
          />
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[0.6rem] font-[700] text-white">
            <Play className="size-2.5" fill="currentColor" aria-hidden />
            Portada
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={mono}>Primeros 3 segundos</p>
          <p className="mt-1 line-clamp-5 text-[0.92rem] leading-snug font-[700] text-ink">
            {a.reel.hook}
          </p>
          <p className="mt-auto flex min-w-0 items-center gap-1 pt-2 text-[0.72rem] text-ink-3">
            <Music2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">Audio original · {user}</span>
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <p className={mono}>Guion</p>
        <ol className="mt-1.5 grid gap-1.5">
          {beats.map((b, k) => (
            <li
              key={k}
              className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-1 text-[0.8rem] leading-snug"
            >
              <span className="font-mono text-ink-3 tabular-nums">{k + 1}</span>
              <span className="line-clamp-1 text-ink sm:line-clamp-2">{b}</span>
            </li>
          ))}
        </ol>
        {extra > 0 && (
          <p className="mt-1.5 text-[0.76rem] text-ink-3">
            y {extra} {extra === 1 ? 'toma más' : 'tomas más'}
          </p>
        )}
      </div>
      <p className="line-clamp-2 shrink-0 border-t border-rule pt-2 text-[0.8rem] leading-snug text-ink-2">
        <span className="font-[700] text-ink">Cierre: </span>
        {a.reel.cta}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ YouTube

function YouTubeVideo({
  a,
  brand,
  style,
  cover,
}: {
  a: AdaptationContent;
  brand: PostBrand;
  style: MaquetaStyle;
  cover: MaquetaSlide;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MaquetaSlideView format="portada" style={style} slide={cover} rounded={false} />
      <div className="flex shrink-0 gap-2.5 px-3.5 pt-3">
        <Avatar name={brand.name} className="size-9 text-[0.66rem]" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-[0.94rem] leading-snug font-[700] text-ink">
            {a.youtube.title}
          </p>
          <p className="mt-1 truncate text-[0.76rem] text-ink-3">
            {brand.name}
            {brand.handle && ` · ${brand.handle}`}
          </p>
        </div>
        <Ellipsis className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      </div>
      <div className="mx-3.5 mt-3 mb-3.5 overflow-hidden rounded-[12px] bg-fill px-3 py-2.5 text-[0.8rem] leading-snug">
        <p className="line-clamp-4 text-ink">{a.angle}</p>
        <p className="mt-2 line-clamp-4 text-ink-2">
          <span className="font-[700] text-ink">Idea de miniatura: </span>
          {a.youtube.thumbnail}
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ exports

/** One post as its network shows it, filling a deck card. */
export function PostPreview({
  card,
  a,
  term,
  brand,
}: {
  card: PostCard;
  a: AdaptationContent;
  term: string;
  brand: PostBrand;
}) {
  const style = previewStyle(brand);
  const slides = slidesOf(card, a, term);
  let body: ReactNode;
  if (card.kind === 'linkedin')
    body = <LinkedInPost hook={card.first} a={a} brand={brand} style={style} slide={slides[0]!} />;
  else if (card.kind === 'carrusel')
    body = <InstagramCarousel a={a} brand={brand} style={style} slides={slides} />;
  else if (card.kind === 'reel')
    body = <ReelScript a={a} brand={brand} style={style} frames={slides} />;
  else body = <YouTubeVideo a={a} brand={brand} style={style} cover={slides[0]!} />;
  return (
    <div className="flex h-full flex-col bg-sheet text-left">
      <Band card={card} />
      {body}
    </div>
  );
}

/** Widths that give each canvas about the same height in a 56 px box. */
const THUMB_WIDTH: Record<MaquetaFormat, number> = {
  post: 50,
  carrusel: 42,
  historia: 30,
  portada: 56,
};

/** The post's image, small: for the list of kept posts. */
export function PostThumb({
  card,
  a,
  term,
  brand,
}: {
  card: PostCard;
  a: AdaptationContent;
  term: string;
  brand: PostBrand;
}) {
  const slides = slidesOf(card, a, term);
  return (
    <span
      className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-fill"
      aria-hidden
    >
      <span className="block" style={{ width: THUMB_WIDTH[card.canvas] }}>
        <MaquetaSlideView
          format={card.canvas}
          style={previewStyle(brand)}
          slide={slides[0]!}
          index={0}
          total={slides.length}
        />
      </span>
    </span>
  );
}
