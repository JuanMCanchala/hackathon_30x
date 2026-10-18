/**
 * A piece's format as a short chip («Carrusel», «Reel», «Post») and the tinted tile that stands in
 * for its picture. Shared by Calendario and Referentes, which both list pieces.
 */
import clsx from 'clsx';
import { FileText, Image as ImageIcon, LayoutGrid, Play, Video } from 'lucide-react';

export type FormatKind = 'carrusel' | 'reel' | 'post' | 'video' | 'imagen' | 'pendiente';

/** Reads a format as the API words it («Reel o TikTok», «carousel») into one of the kinds. */
export function formatKind(format: string): FormatKind {
  const f = format.toLowerCase();
  if (f.includes('carous') || f.includes('carrusel')) return 'carrusel';
  if (f.includes('reel') || f.includes('short') || f.includes('tiktok')) return 'reel';
  if (f.includes('video') || f.includes('youtube')) return 'video';
  if (f.includes('image') || f.includes('imagen')) return 'imagen';
  return 'post';
}

const LABEL: Record<FormatKind, string> = {
  carrusel: 'Carrusel',
  reel: 'Reel',
  post: 'Post',
  video: 'Video',
  imagen: 'Imagen',
  pendiente: 'Por elegir',
};

const CHIP: Record<FormatKind, string> = {
  carrusel: 'bg-lavender text-on-lavender',
  reel: 'bg-marker/15 text-marker-strong',
  post: 'bg-fill text-ink',
  video: 'bg-st-crecimiento-tint text-st-crecimiento',
  imagen: 'bg-st-emergente-tint text-st-emergente',
  pendiente: 'border border-dashed border-rule-strong text-ink-2',
};

const TINT: Record<FormatKind, string> = {
  carrusel: 'bg-lavender-tint text-brand',
  reel: 'bg-marker/12 text-marker-strong',
  post: 'bg-fill text-ink-2',
  video: 'bg-st-crecimiento-tint text-st-crecimiento',
  imagen: 'bg-st-emergente-tint text-st-emergente',
  pendiente: 'bg-sheet-2 text-ink-3',
};

const ICON: Record<FormatKind, typeof FileText> = {
  carrusel: LayoutGrid,
  reel: Play,
  post: FileText,
  video: Video,
  imagen: ImageIcon,
  pendiente: FileText,
};

/** «Carrusel» on its tint. */
export function FormatChip({ kind, className }: { kind: FormatKind; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex w-fit items-center rounded-[6px] px-2 py-[3px] text-[0.75rem] font-[700] whitespace-nowrap',
        CHIP[kind],
        className,
      )}
    >
      {LABEL[kind]}
    </span>
  );
}

/** A tinted block with the format's icon, where the mockup shows the piece's picture. */
export function FormatTile({ kind, className }: { kind: FormatKind; className?: string }) {
  const Icon = ICON[kind];
  return (
    <span
      className={clsx('grid shrink-0 place-items-center rounded-[8px]', TINT[kind], className)}
      aria-hidden
    >
      <Icon className="size-[40%] max-h-8 max-w-8" strokeWidth={1.8} />
    </span>
  );
}

/** Button-like link styles from the mockup: solid orange and outlined white. */
export const linkBtn = {
  primary:
    'inline-flex h-10 items-center justify-center gap-1.5 rounded-[9px] bg-marker px-4 text-[0.92rem] font-[700] whitespace-nowrap text-on-marker transition hover:bg-marker-strong',
  outline:
    'inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-rule-strong bg-sheet px-3.5 text-[0.88rem] font-[600] whitespace-nowrap text-ink transition hover:border-ink',
};
