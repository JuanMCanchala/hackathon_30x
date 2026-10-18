'use client';

/**
 * One caught piece on the Vigía screen, as in the mockup: the original title, the idea in
 * Spanish, chips for why it was caught, up to three thumbnails (carousel slides or the video's
 * key points) and «Adaptar», which writes the 30X version and opens it inline.
 */
import * as Tabs from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  CopyButton,
  FORMATS,
  FormatBody,
  textOf,
  type Format,
} from '@/components/adaptation-panel';
import { fmtCompact, fmtInt } from '@/components/ui';
import { ago, darkBtn, LangBadge, outlineBtn } from '@/components/vigia-ui';
import { ApiError, post } from '@/lib/api';
import { PLATFORM_COPY, type AdaptationContent, type WatchHit } from '@/lib/types';

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

// ------------------------------------------------------------------ thumbnails

const tile = 'relative block aspect-square overflow-hidden rounded-[10px] bg-fill';
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

// ------------------------------------------------------------------ adaptation

function PieceAdaptation({ a }: { a: AdaptationContent }) {
  const [format, setFormat] = useState<Format>('linkedin');
  return (
    <div className="grid gap-4 rounded-[12px] border border-rule bg-sheet-2 p-4">
      <div>
        <p className="font-mono text-[0.72rem] tracking-[0.1em] text-ink-3 uppercase">
          El ángulo de 30X
        </p>
        <p className="mt-1 leading-snug font-[650] text-ink">{a.angle}</p>
      </div>
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
    </div>
  );
}

// ------------------------------------------------------------------ the card

const chip =
  'inline-flex items-center rounded-[6px] px-2 py-[3px] text-[0.76rem] font-[650] whitespace-nowrap';

/** A caught piece as a bordered inner card. */
export function HitCard({
  hit,
  watchId,
  onAdapted,
}: {
  hit: WatchHit;
  watchId: string;
  onAdapted: () => void;
}) {
  const p = hit.piece;
  const c = hit.capture;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const why = readReasons(hit.reasons);
  const metrics = metricsOf(hit);
  const meta = [PLATFORM_COPY[p.platform], FORMAT_COPY[p.format], ago(p.publishedAt)].filter(
    Boolean,
  );
  const spanish = c?.es ?? c?.idea ?? null;

  const adapt = async () => {
    if (hit.adaptation) {
      setOpen((o) => !o);
      return;
    }
    setBusy(true);
    try {
      await post(`/api/v1/watches/${watchId}/hits/${encodeURIComponent(p.id)}/adapt`, {});
      onAdapted();
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo escribir ahora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-[12px] border border-rule p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-1">
        <h3
          lang={hit.lang}
          className="line-clamp-3 min-w-0 flex-1 basis-[16rem] text-[1.06rem] leading-snug font-[700] text-ink"
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
          aria-expanded={hit.adaptation ? open : undefined}
          className={darkBtn}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {busy
            ? 'Escribiendo…'
            : hit.adaptation
              ? open
                ? 'Ocultar la adaptación'
                : 'Ver la adaptación'
              : 'Adaptar'}
        </button>
        <a href={p.url} target="_blank" rel="noreferrer" className={outlineBtn}>
          Ver original
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
      {open && hit.adaptation && <PieceAdaptation a={hit.adaptation} />}
    </li>
  );
}
