import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import { fmtCompact } from './ui';
import { PLATFORM_COPY, type Piece } from '@/lib/types';

const fmtDate = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Bogota',
});

function metrics(p: Piece): string[] {
  const out: string[] = [];
  if (p.views)
    out.push(`${fmtCompact(p.views)} ${p.platform === 'huggingface' ? 'descargas' : 'vistas'}`);
  if (p.likes)
    out.push(
      `${fmtCompact(p.likes)} ${p.platform === 'github' ? 'estrellas' : p.platform === 'hn' ? 'puntos' : 'reacciones'}`,
    );
  if (p.comments) out.push(`${fmtCompact(p.comments)} comentarios`);
  if (p.shares) out.push(`${fmtCompact(p.shares)} compartidos`);
  return out;
}

/** One piece of evidence: who, what it opened with, how it did against its author's median. */
export function PieceCard({ piece, cited }: { piece: Piece; cited?: boolean }) {
  const text = piece.hook || piece.title || piece.text;
  const ratio = piece.outlier;
  return (
    <a
      href={piece.url}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        'group grid content-start gap-2.5 rounded-[18px] bg-sheet p-4 shadow-sheet transition hover:-translate-y-0.5',
        cited && 'ring-2 ring-brand/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.92rem] font-[700] text-ink">{piece.authorName}</p>
          <p className="text-[0.78rem] text-ink-3">
            {PLATFORM_COPY[piece.platform]}
            {piece.authorFollowers ? `, ${fmtCompact(piece.authorFollowers)} seguidores` : ''},{' '}
            {fmtDate.format(new Date(piece.publishedAt))}
          </p>
        </div>
        {ratio !== null && ratio >= 1.5 && (
          <span
            className={clsx(
              'shrink-0 rounded-full px-2 py-0.5 text-[0.76rem] font-[760] whitespace-nowrap',
              ratio >= 5 ? 'bg-marker text-on-marker' : 'bg-brand-tint text-brand',
            )}
            title="Engagement frente a la mediana de su propio autor"
          >
            {ratio.toLocaleString('es-CO', { maximumFractionDigits: 1 })}× su mediana
          </span>
        )}
      </div>
      <p className="line-clamp-4 text-[0.95rem] leading-snug text-ink">{text}</p>
      <div className="mt-auto flex items-end justify-between gap-2">
        <p className="text-[0.78rem] text-ink-2">
          {metrics(piece).join(', ') || 'sin métricas públicas'}
        </p>
        <ArrowUpRight
          className="size-4 shrink-0 text-ink-3 group-hover:text-brand"
          aria-label="Abrir la pieza original"
        />
      </div>
    </a>
  );
}
