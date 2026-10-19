'use client';

/**
 * One caught piece on the Vigía screen, as in the mockup: the original title, the idea in
 * Spanish, chips for why it was caught, up to three thumbnails (carousel slides or the video's
 * key points) and «Adaptar», which writes the 30X version. The adaptation opens like Elegir: a
 * deck of the posts made from the piece, one at a time, kept to the right and dropped to the left.
 */
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import {
  ArrowUpRight,
  CalendarCheck2,
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  FileText,
  HardDrive,
  LayoutTemplate,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Undo2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CopyButton,
  FORMATS,
  FormatBody,
  textOf,
  type Format,
} from '@/components/adaptation-panel';
import { DarkNote, IconTile } from '@/components/kit';
import { DeckDone, PostDeck } from '@/components/post-deck';
import {
  PostPreview,
  PostThumb,
  postCardsFrom,
  stampOfAdaptation,
  type PostBrand,
  type PostCard,
} from '@/components/post-previews';
import { ScheduleDialog } from '@/components/schedule-dialog';
import { Button, fmtCompact, fmtInt } from '@/components/ui';
import { ago, darkBtn, LangBadge, outlineBtn } from '@/components/vigia-ui';
import { ApiError, post } from '@/lib/api';
import { dayLong, fmtHour } from '@/lib/dates';
import { usePostDecisions } from '@/lib/post-decisions';
import { PLATFORM_COPY, type AdaptationContent, type WatchHit } from '@/lib/types';
import { useProfile } from '@/lib/workspace';

type Capture = NonNullable<WatchHit['capture']>;
type Slide = NonNullable<Capture['slides']>[number];

const FORMAT_COPY: Record<string, string> = {
  carousel: 'carrusel',
  reel: 'reel',
  short: 'short',
  video: 'video',
  image: 'imagen',
};

/** The chips a hit's reasons turn into: topic, 30X fit, outlier, and the rest quietly. */
interface ReadReasons {
  topic: string | null;
  fit: string | null;
  outlier: string | null;
  quiet: string[];
}

/**
 * Reads the screen's reasons («JEV: es del tema (93 %).», «Encaje con 30X: 8/10 (JEV).»,
 * «6,1× la mediana de su autor.») into chips. The age is left out: the meta line shows it.
 */
export function readReasons(reasons: string[]): ReadReasons {
  const out: ReadReasons = { topic: null, fit: null, outlier: null, quiet: [] };
  for (const raw of reasons) {
    const r = raw.trim().replace(/\.$/, '');
    const jev = /^JEV: es del tema \((\d+)\s?%\)/.exec(r);
    if (jev) {
      out.topic = `Es del tema · ${jev[1]} %`;
      continue;
    }
    if (r.startsWith('Menciona ')) {
      out.topic ??= r;
      continue;
    }
    const fit = /^Encaje con 30X: (\d+)\/10/.exec(r);
    if (fit) {
      out.fit = `Encaje 30X ${fit[1]}/10`;
      continue;
    }
    if (r.endsWith('la mediana de su autor')) {
      out.outlier = r;
      continue;
    }
    if (r.startsWith('Publicada hace')) continue;
    out.quiet.push(r);
  }
  return out;
}

function metricsOf(hit: WatchHit): string {
  const p = hit.piece;
  const out: string[] = [];
  if (p.views) out.push(`${fmtCompact(p.views)} vistas`);
  if (p.likes) out.push(`${fmtCompact(p.likes)} ${p.platform === 'hn' ? 'puntos' : 'reacciones'}`);
  if (p.comments) out.push(`${fmtCompact(p.comments)} comentarios`);
  if (p.shares) out.push(`${fmtCompact(p.shares)} compartidos`);
  return out.join(' · ');
}

/** The YouTube video id of a piece, for its public thumbnail. */
function youtubeId(hit: WatchHit): string | null {
  if (hit.piece.platform !== 'youtube') return null;
  if (hit.piece.id.startsWith('youtube:')) return hit.piece.id.slice('youtube:'.length);
  try {
    return new URL(hit.piece.url).searchParams.get('v');
  } catch {
    return null;
  }
}

/** Seconds since `on` turned true, for the «writing» copy. */
function useElapsed(on: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setS((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      setS(0);
    };
  }, [on]);
  return s;
}

// ------------------------------------------------------------------ thumbnails

// Portrait on a phone: the square is too short there for «Ideas clave del video».
const tile = 'relative block aspect-[3/4] overflow-hidden rounded-[10px] bg-fill sm:aspect-square';
const caption =
  'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-2.5 pt-6 pb-2 text-[0.74rem] leading-tight font-[700] text-white';

function SlideTile({ s, more }: { s: Slide; more: number }) {
  return (
    <a
      href={s.image}
      target="_blank"
      rel="noreferrer"
      className={tile}
      title={s.es || s.text || `Lámina ${s.n}`}
    >
      <img
        src={s.image}
        alt={s.text ? `Lámina ${s.n}: ${s.text}` : `Lámina ${s.n}`}
        className="size-full object-cover"
        loading="lazy"
      />
      {more > 0 && (
        <span className="absolute top-2 right-2 rounded-[6px] bg-black/65 px-1.5 py-0.5 text-[0.72rem] font-[700] text-white">
          +{more}
        </span>
      )}
      <span className={caption}>
        <span className="line-clamp-2">
          Lámina {s.n}
          {s.es ? ` · ${s.es.split('\n')[0]}` : ''}
        </span>
      </span>
    </a>
  );
}

function Thumbs({
  hit,
  pointsOpen,
  onTogglePoints,
}: {
  hit: WatchHit;
  pointsOpen: boolean;
  onTogglePoints: () => void;
}) {
  const c = hit.capture;
  const slides = c?.slides ?? [];
  const yt = youtubeId(hit);
  const video = c?.video ?? null;
  if (!slides.length && !yt && !video) return null;
  const shown = slides.slice(0, video ? 2 : 3);
  return (
    <div className="grid max-w-[372px] grid-cols-3 gap-2">
      {shown.map((s, i) => (
        <SlideTile
          key={s.n}
          s={s}
          more={i === shown.length - 1 && !video ? slides.length - shown.length : 0}
        />
      ))}
      {!slides.length && yt && (
        <a href={hit.piece.url} target="_blank" rel="noreferrer" className={tile}>
          <img
            src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`}
            alt="Miniatura del video"
            className="size-full object-cover"
            loading="lazy"
          />
          {video?.hook && (
            <span className={caption}>
              <span className="line-clamp-2">Primeros segundos · {video.hook}</span>
            </span>
          )}
        </a>
      )}
      {video && (
        <button
          type="button"
          onClick={onTogglePoints}
          aria-expanded={pointsOpen}
          className={clsx(
            tile,
            'grid content-between bg-ink p-2.5 text-left text-sheet ring-offset-2 transition hover:opacity-90',
            pointsOpen && 'ring-2 ring-marker',
          )}
        >
          <span className="font-mono text-[0.7rem] tracking-[0.06em] opacity-70">
            {fmtInt(video.points.length)} IDEAS
          </span>
          <span className="text-[0.78rem] leading-tight font-[700]">
            Ideas clave del video
            <span className="mt-0.5 block text-[0.7rem] font-[500] opacity-70">
              {pointsOpen ? 'Ocultar' : 'Ver'}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

function KeyPoints({ video }: { video: NonNullable<Capture['video']> }) {
  return (
    <div className="grid gap-1.5 rounded-[12px] bg-sheet-2 px-4 py-3">
      <p className="text-[0.92rem] text-ink">
        <span className="font-[700]">Primeros segundos: </span>
        {video.hook}
      </p>
      <ol className="grid list-decimal gap-0.5 pl-5 text-[0.9rem] text-ink-2">
        {video.points.map((pt) => (
          <li key={pt}>{pt}</li>
        ))}
      </ol>
      <p className="text-[0.76rem] text-ink-3">
        Leído de sus subtítulos ({fmtInt(video.transcriptChars)} caracteres).
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ the adaptation as text

/** Everything the adaptation says, by format, to read or copy at once. */
function PieceAdaptation({ a, className }: { a: AdaptationContent; className?: string }) {
  const [format, setFormat] = useState<Format>('linkedin');
  return (
    <div className={clsx('grid gap-4 rounded-[12px] border border-rule p-4', className)}>
      <ul className="grid gap-1.5 md:grid-cols-3">
        {a.hooks.map((h) => (
          <li
            key={h}
            className="rounded-[10px] border border-rule bg-sheet px-3 py-2 text-[0.9rem] text-ink"
          >
            {h}
          </li>
        ))}
      </ul>
      <Tabs.Root
        value={format}
        onValueChange={(v) => setFormat(v as Format)}
        className="grid gap-3"
      >
        <Tabs.List
          className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] bg-fill p-1"
          aria-label="Formato"
        >
          {FORMATS.map((f) => (
            <Tabs.Trigger
              key={f.value}
              value={f.value}
              className="rounded-[8px] px-3 py-1.5 text-[0.86rem] font-[650] whitespace-nowrap text-ink-2 data-[state=active]:bg-sheet data-[state=active]:text-ink data-[state=active]:shadow-sheet"
            >
              {f.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {FORMATS.map((f) => (
          <Tabs.Content key={f.value} value={f.value} className="grid gap-3 outline-none">
            <div className="flex justify-end">
              <CopyButton text={textOf(a, f.value)} />
            </div>
            <FormatBody a={a} format={f.value} />
          </Tabs.Content>
        ))}
      </Tabs.Root>
      {a.avoid.length > 0 && (
        <div className="rounded-[12px] bg-st-saturado-tint px-4 py-3">
          <p className="text-[0.84rem] font-[700] text-ink">Qué evitar</p>
          <ul className="mt-1 list-disc pl-5 text-[0.9rem] text-ink-2">
            {a.avoid.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** «Ver todo el texto»: the quiet way to the full adaptation, for whoever wants to copy it all. */
function AllText({ a }: { a: AdaptationContent }) {
  const [open, setOpen] = useState(false);
  const reveal = useCallback((el: HTMLDivElement | null) => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  return (
    <div className="grid gap-3 border-t border-rule pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 justify-self-start rounded-[8px] text-[0.9rem] font-[650] text-ink-2 hover:text-ink max-lg:-my-2.5 max-lg:py-2.5"
      >
        <FileText className="size-4" aria-hidden />
        {open ? 'Ocultar el texto' : 'Ver todo el texto'}
        <ChevronDown
          className={clsx('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div ref={reveal} className="scroll-mt-4">
          <PieceAdaptation a={a} className="bg-sheet" />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ the kept posts

const smallBtn =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] px-2 text-[0.8rem] font-[650] whitespace-nowrap transition lg:h-8';
const smallDark = clsx(smallBtn, 'bg-ink text-sheet hover:opacity-90');
const smallOutline = clsx(smallBtn, 'border border-rule-strong bg-sheet text-ink hover:border-ink');

function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error('No se pudo copiar.');
        }
      }}
      className={smallOutline}
    >
      {done ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {done ? 'Copiado' : 'Copiar texto'}
    </button>
  );
}

/** «/maquetas/nueva?…»: the designer opens with this piece's adaptation on the post's canvas. */
function maquetaHref(watchId: string, itemId: string, card: PostCard): string {
  const q = new URLSearchParams({ vigia: watchId, pieza: itemId, formato: card.canvas });
  if (card.kind === 'linkedin' && card.hook !== undefined) q.set('gancho', String(card.hook + 1));
  return `/maquetas/nueva?${q.toString()}`;
}

function Chosen({
  cards,
  decisions,
  scheduled,
  a,
  term,
  brand,
  watchId,
  itemId,
  onUndo,
  onSchedule,
}: {
  cards: PostCard[];
  decisions: ReturnType<typeof usePostDecisions>['decisions'];
  scheduled: ReturnType<typeof usePostDecisions>['scheduled'];
  a: AdaptationContent;
  term: string;
  brand: PostBrand;
  watchId: string;
  itemId: string;
  onUndo: (card: PostCard) => void;
  onSchedule: (card: PostCard) => void;
}) {
  const kept = cards.filter((c) => decisions[c.id] === 'sirve');
  const later = cards.filter((c) => decisions[c.id] === 'despues').length;
  const discarded = cards.filter((c) => decisions[c.id] === 'no').length;
  return (
    <section className="rounded-[14px] border border-rule bg-sheet p-4">
      <div className="flex items-center gap-3">
        <IconTile tone="orange" className="size-12 rounded-[12px] [&_svg]:size-5">
          <FileText />
        </IconTile>
        <div className="min-w-0">
          <h3 className="text-[1.15rem] font-[700] text-ink">
            Elegidos
            {kept.length > 0 && (
              <span className="ml-1.5 text-ink-3 tabular-nums">{kept.length}</span>
            )}
          </h3>
          <p className="text-[0.88rem] text-ink-2">Prográmalos o ármales la maqueta</p>
        </div>
      </div>

      {kept.length === 0 ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-rule-strong px-4 py-4 text-[0.95rem] text-ink">
          Todavía nada. Desliza a la derecha los posts que le sirven a tu equipo.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {kept.map((card) => {
            const when = scheduled[card.id];
            return (
              <li
                key={card.id}
                className="pass-in grid gap-2.5 rounded-[12px] border border-rule p-3"
              >
                <div className="flex items-start gap-3">
                  <PostThumb card={card} a={a} term={term} brand={brand} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8rem] font-[700] text-ink">
                      {card.name} <span className="font-[500] text-ink-3">· {card.detail}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[0.88rem] leading-snug text-ink">
                      {card.first}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUndo(card)}
                    className="-mt-2 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink lg:-mt-1 lg:-mr-1 lg:size-8"
                    aria-label={`Deshacer: ${card.name}, ${card.detail}, vuelve a la pila`}
                    title="Deshacer"
                  >
                    <Undo2 className="size-4" aria-hidden />
                  </button>
                </div>
                {when && (
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[0.8rem] text-st-emergente">
                    <CalendarCheck2 className="size-3.5 shrink-0" aria-hidden />
                    <span className="font-[650]">
                      En el calendario: {dayLong(when.date)}
                      {when.time ? `, ${fmtHour(when.time)}` : ''}
                    </span>
                    <Link href="/calendario" className="font-[650] text-brand hover:underline">
                      Ver
                    </Link>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => onSchedule(card)} className={smallDark}>
                    <CalendarPlus className="size-3.5" aria-hidden />
                    Programar
                  </button>
                  <Link href={maquetaHref(watchId, itemId, card)} className={smallOutline}>
                    <LayoutTemplate className="size-3.5" aria-hidden />
                    Armar maqueta
                  </Link>
                  <CopyText text={card.text} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(later > 0 || discarded > 0) && (
        <p className="mt-4 text-[0.82rem] text-ink-3">
          {later > 0 && <>{fmtInt(later)} para después</>}
          {later > 0 && discarded > 0 && ' · '}
          {discarded > 0 && (
            <>
              {fmtInt(discarded)} {discarded === 1 ? 'no sirve' : 'no sirven'}
            </>
          )}
        </p>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ choosing the posts

/**
 * The caught piece in one line (language, author, its idea in Spanish) and the angle the posts
 * take. Beside the deck (`side`) the idea gets a second line, since the column is narrow.
 */
function PieceSummary({
  hit,
  spanish,
  angle,
  team,
  side,
}: {
  hit: WatchHit;
  spanish: string;
  angle: string;
  team: string;
  side?: boolean;
}) {
  const p = hit.piece;
  return (
    <section className="grid gap-1.5 rounded-[14px] border border-rule bg-sheet px-4 py-3">
      <p className="flex min-w-0 items-center gap-2 text-[0.86rem]">
        <LangBadge lang={hit.lang} />
        <span className={clsx('min-w-0 truncate font-[650] text-ink', !side && 'shrink-0')}>
          {p.authorName}
        </span>
        {!side && (
          <span className="min-w-0 truncate text-ink-2" title={spanish}>
            «{spanish}»
          </span>
        )}
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex shrink-0 items-center gap-0.5 font-[650] text-brand hover:underline max-lg:-my-3 max-lg:-mr-3 max-lg:p-3"
        >
          <span className="sr-only sm:not-sr-only">Original</span>
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </p>
      {side && (
        <p className="line-clamp-2 text-[0.88rem] leading-snug text-ink-2" title={spanish}>
          «{spanish}»
        </p>
      )}
      <p
        className={clsx(
          'text-[0.95rem] leading-snug text-ink',
          side ? 'mt-1 line-clamp-4' : 'line-clamp-3 sm:line-clamp-2',
        )}
      >
        <span className="mr-2 font-mono text-[0.7rem] tracking-[0.1em] text-ink-3 uppercase">
          El ángulo de {team}
        </span>
        {angle}
      </p>
    </section>
  );
}

function PostsChooser({
  hit,
  a,
  watchId,
  term,
}: {
  hit: WatchHit;
  a: AdaptationContent;
  watchId: string;
  term: string;
}) {
  const [profile] = useProfile();
  const p = hit.piece;
  const brand: PostBrand = {
    name: profile.name.trim() || '30X',
    handle: profile.references[0]?.handle?.trim() ?? '',
    tagline: profile.industry.trim(),
  };
  const cards = useMemo(() => postCardsFrom(a), [a]);
  const { decisions, scheduled, decide, reset, markScheduled } = usePostDecisions(
    watchId,
    p.id,
    stampOfAdaptation(a),
  );
  const [scheduling, setScheduling] = useState<PostCard | null>(null);

  const pending = cards.filter((c) => !decisions[c.id]);
  const kept = cards.filter((c) => decisions[c.id] === 'sirve').length;
  const later = cards.filter((c) => decisions[c.id] === 'despues').length;
  const discarded = cards.filter((c) => decisions[c.id] === 'no').length;
  const total = cards.length;
  const counter = `${Math.min(total - pending.length + 1, total)} / ${fmtInt(total)}`;
  const spanish = (hit.capture?.es ?? hit.capture?.idea ?? (p.title || p.text)).trim();
  const describe = (c: PostCard) => `${c.name}, ${c.detail}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 sm:gap-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogPrimitive.Title className="text-[1.3rem] leading-tight font-[700] tracking-[-0.02em] text-ink sm:text-[1.625rem]">
            Elige los posts que sirven
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 hidden text-[0.95rem] text-ink-2 sm:block">
            OndAI escribió {fmtInt(total)} posts a partir de esta pieza. A la derecha si sirve, a la
            izquierda si no.
          </DialogPrimitive.Description>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="rounded-[8px] border border-rule bg-sheet px-3 py-1.5 text-[0.92rem] font-[600] text-ink tabular-nums"
            aria-label={`Post ${counter.replace(' / ', ' de ')}`}
          >
            {counter}
          </span>
          <DialogPrimitive.Close
            className="grid size-9 place-items-center rounded-full border border-rule bg-sheet text-ink-2 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="size-4" strokeWidth={2.5} aria-hidden />
          </DialogPrimitive.Close>
        </div>
      </header>

      {/* On a phone the piece leads; on a desktop it sits beside the deck, so the deck fits. */}
      <div className="lg:hidden">
        <PieceSummary hit={hit} spanish={spanish} angle={a.angle} team={brand.name} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0">
          {pending.length > 0 ? (
            <PostDeck
              cards={pending}
              onDecide={(card, d) => decide(card.id, d)}
              describe={describe}
              keyboard={!scheduling}
              render={(card) => <PostPreview card={card} a={a} term={term} brand={brand} />}
              cardClassName="h-[480px] w-[min(300px,calc(100vw-56px))] sm:h-[clamp(480px,calc(100dvh-290px),560px)] sm:w-[344px]"
              stageClassName="h-[496px] sm:h-[clamp(496px,calc(100dvh-266px),584px)] lg:[--fan:72px] xl:[--fan:136px]"
            />
          ) : (
            <DeckDone
              title={`Revisaste los ${fmtInt(total)} posts`}
              note="Los que sirven quedan en Elegidos: prográmalos o ármales la maqueta. Nada se publica sin aprobación."
              counts={[
                { label: 'Sirven', value: kept },
                { label: 'Para después', value: later },
                { label: 'No sirven', value: discarded },
              ]}
              actions={
                <>
                  <Link
                    href="/calendario"
                    className="inline-flex h-10 items-center rounded-full bg-marker px-5 text-[0.94rem] font-[650] text-on-marker hover:bg-marker-strong"
                  >
                    Ir al calendario
                  </Link>
                  {later > 0 && (
                    <Button onClick={() => reset('despues')}>
                      Repasar los de después ({fmtInt(later)})
                    </Button>
                  )}
                  <Button icon={<RotateCcw className="size-4" />} onClick={() => reset()}>
                    Volver a empezar
                  </Button>
                </>
              }
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="hidden lg:block">
            <PieceSummary hit={hit} spanish={spanish} angle={a.angle} team={brand.name} side />
          </div>
          <Chosen
            cards={cards}
            decisions={decisions}
            scheduled={scheduled}
            a={a}
            term={term}
            brand={brand}
            watchId={watchId}
            itemId={p.id}
            onUndo={(card) => decide(card.id, null)}
            onSchedule={setScheduling}
          />
          <DarkNote className="items-stretch">
            <ul className="grid gap-2.5">
              <li className="flex items-center gap-3">
                <HardDrive className="size-4 shrink-0 text-sheet/80" aria-hidden />
                Tus decisiones se guardan en este navegador.
              </li>
              <li className="flex items-center gap-3">
                <ShieldCheck className="size-4 shrink-0 text-sheet/80" aria-hidden />
                Nada se publica sin aprobación.
              </li>
            </ul>
          </DarkNote>
        </div>
      </div>

      <AllText a={a} />

      {scheduling && (
        <ScheduleDialog
          open
          onOpenChange={(o) => {
            if (!o) setScheduling(null);
          }}
          source={{ watchId, itemId: p.id, format: scheduling.format, hook: scheduling.hook }}
          what={`${scheduling.name} · ${scheduling.detail} · ${term}`}
          onScheduled={(entry) =>
            markScheduled(scheduling.id, {
              date: entry.scheduledFor,
              time: entry.scheduledTime,
            })
          }
        />
      )}
    </div>
  );
}

/** Large on a desktop, the whole screen on a phone; it scrolls, the page under it does not. */
function PostsDialog({
  open,
  onOpenChange,
  ...rest
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hit: WatchHit;
  a: AdaptationContent;
  watchId: string;
  term: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[6px]" />
        <DialogPrimitive.Content
          // z-40 like its overlay: a dialog opened from inside («Programar») dims this one.
          onOpenAutoFocus={(e) => {
            // Focus the dialog itself: the arrow keys work at once and no button looks pressed.
            e.preventDefault();
            (e.target as HTMLElement | null)?.focus?.();
          }}
          className="fixed inset-0 z-40 overflow-x-hidden overflow-y-auto overscroll-contain bg-paper outline-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[94dvh] sm:w-[min(1200px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[22px] sm:shadow-float"
        >
          <PostsChooser {...rest} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** «2 elegidos · 4 por revisar» under a piece whose posts are being chosen. */
function progressCopy(total: number, kept: number, pending: number): string {
  if (pending === total) return `${fmtInt(total)} posts para elegir`;
  const k = kept > 0 ? `${fmtInt(kept)} ${kept === 1 ? 'elegido' : 'elegidos'}` : 'Ninguno elegido';
  return pending > 0 ? `${k} · ${fmtInt(pending)} por revisar` : `${k} de ${fmtInt(total)}`;
}

// ------------------------------------------------------------------ the card

const chip =
  'inline-flex items-center rounded-[6px] px-2 py-[3px] text-[0.76rem] font-[650] whitespace-nowrap';

/** A caught piece as a bordered inner card. */
export function HitCard({
  hit,
  watchId,
  term,
  onAdapted,
}: {
  hit: WatchHit;
  watchId: string;
  /** The followed topic: the kicker on the posts' covers. */
  term: string;
  onAdapted: () => void;
}) {
  const p = hit.piece;
  const c = hit.capture;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  // What the API answered while the list refreshes, so the deck opens at once.
  const [written, setWritten] = useState<AdaptationContent | null>(null);
  const adaptation = hit.adaptation ?? written;
  const elapsed = useElapsed(busy);
  const cards = useMemo(() => (adaptation ? postCardsFrom(adaptation) : []), [adaptation]);
  const { decisions } = usePostDecisions(
    watchId,
    p.id,
    adaptation ? stampOfAdaptation(adaptation) : '',
  );
  const why = readReasons(hit.reasons);
  const metrics = metricsOf(hit);
  const meta = [PLATFORM_COPY[p.platform], FORMAT_COPY[p.format], ago(p.publishedAt)].filter(
    Boolean,
  );
  const spanish = c?.es ?? c?.idea ?? null;

  const adapt = async () => {
    if (adaptation) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const a = await post<AdaptationContent>(
        `/api/v1/watches/${watchId}/hits/${encodeURIComponent(p.id)}/adapt`,
        { variant: 0 },
      );
      setWritten(a);
      onAdapted();
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo escribir ahora.');
    } finally {
      setBusy(false);
    }
  };

  const kept = cards.filter((card) => decisions[card.id] === 'sirve').length;
  const pending = cards.filter((card) => !decisions[card.id]).length;

  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-[12px] border border-rule p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1">
        <h3
          lang={hit.lang}
          className="line-clamp-3 min-w-0 flex-1 basis-[16rem] text-[1.06rem] leading-snug font-[700] break-words text-ink"
        >
          “{(p.title || p.text).trim()}”
        </h3>
        <p className="pt-1 font-mono text-[0.74rem] whitespace-nowrap text-ink-3">
          {meta.join(' · ')}
        </p>
      </div>
      <p className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-ink-3">
        <LangBadge lang={hit.lang} />
        <span className="font-[650] text-ink-2">{p.authorName}</span>
        {metrics && <span>· {metrics}</span>}
      </p>

      {spanish ? (
        <p className="line-clamp-3 text-[0.95rem] leading-snug text-ink-2">
          La idea en español: <span className="text-ink">«{spanish.trim()}»</span>
        </p>
      ) : (
        <p className="text-[0.9rem] text-ink-3">Sin traducción todavía.</p>
      )}
      {c?.idea && c.es && (
        <p className="line-clamp-3 text-[0.88rem] leading-snug text-ink-3">{c.idea}</p>
      )}

      <ul className="flex flex-wrap items-center gap-1.5">
        {why.topic && (
          <li className={clsx(chip, 'bg-st-emergente-tint text-st-emergente')}>{why.topic}</li>
        )}
        {why.fit && <li className={clsx(chip, 'bg-fill text-ink')}>{why.fit}</li>}
        {why.outlier && (
          <li className={clsx(chip, 'bg-marker/12 text-marker-strong')}>{why.outlier}</li>
        )}
        {why.quiet.map((r) => (
          <li key={r} className="px-1 text-[0.76rem] text-ink-3">
            {r}
          </li>
        ))}
      </ul>

      <Thumbs hit={hit} pointsOpen={pointsOpen} onTogglePoints={() => setPointsOpen((o) => !o)} />
      {pointsOpen && c?.video && <KeyPoints video={c.video} />}

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={adapt}
          disabled={busy}
          aria-haspopup={adaptation ? 'dialog' : undefined}
          className={darkBtn}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {busy ? 'Escribiendo…' : adaptation ? 'Ver la adaptación' : 'Adaptar'}
        </button>
        <a href={p.url} target="_blank" rel="noreferrer" className={outlineBtn}>
          Ver original
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
        {adaptation && cards.length > 0 && (
          <span className="text-[0.84rem] text-ink-2">
            {progressCopy(cards.length, kept, pending)}
          </span>
        )}
      </div>
      {busy && (
        <p className="text-[0.84rem] text-ink-2" role="status">
          {`Escribiendo los posts a partir de esta pieza. Suele tardar menos de un minuto (${elapsed} s).`}
        </p>
      )}
      {adaptation && (
        <PostsDialog
          open={open}
          onOpenChange={setOpen}
          hit={hit}
          a={adaptation}
          watchId={watchId}
          term={term}
        />
      )}
    </li>
  );
}
