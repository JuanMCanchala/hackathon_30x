'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Page } from '@/components/shell';
import { Empty, PageHeader, Skeleton, StageTag, fmtCompact, fmtGrowth } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { PLATFORM_COPY, type Platform, type RadarTopic } from '@/lib/types';

interface RefPiece {
  id: string;
  url: string;
  platform: Platform;
  publishedAt: string;
  format: string;
  text: string;
  hook: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagement: number;
  ratio: number | null;
  topics: { id: string; name: string }[];
}

interface Profile {
  name: string;
  role: string;
  platform: Platform;
  url: string;
  followers: number | null;
  pieces: number;
  medianEngagement: number;
  best: RefPiece[];
  formats: { format: string; pieces: number; medianRatio: number }[];
}

const FORMAT: Record<string, string> = {
  reel: 'Reels',
  carousel: 'Carruseles',
  image: 'Imágenes',
  post: 'Posts',
  video: 'Videos',
  short: 'Videos cortos',
};
const fmtDate = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Bogota',
});

function ProfileCard({ p }: { p: Profile }) {
  return (
    <section className="sheet grid content-start gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="t-h3 text-ink">
            {p.name}{' '}
            <span className="font-sans text-[0.95rem] font-[500] text-ink-3">
              en {PLATFORM_COPY[p.platform]}
            </span>
          </h2>
          <p className="text-[0.9rem] text-ink-2">
            {p.role}
            {p.followers ? `, ${fmtCompact(p.followers)} seguidores` : ''}
          </p>
        </div>
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[0.88rem] font-[600] text-brand hover:underline"
        >
          Ver perfil <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </header>
      {p.pieces === 0 ? (
        <p className="text-ink-3">Todavía no hay piezas capturadas de este perfil.</p>
      ) : (
        <>
          <p className="text-[0.92rem] text-ink-2">
            {p.pieces} piezas leídas. Una pieza típica suya suma {fmtCompact(p.medianEngagement)}{' '}
            interacciones; estas son las que más se salieron de su propia mediana.
          </p>
          {p.formats.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {p.formats.map((f) => (
                <span
                  key={f.format}
                  className="rounded-full bg-fill px-3 py-1 text-[0.82rem] text-ink-2"
                >
                  <span className="font-[700] text-ink">{FORMAT[f.format] ?? f.format}</span>:{' '}
                  {f.pieces}, rinden {f.medianRatio.toLocaleString('es-CO')}× su mediana
                </span>
              ))}
            </div>
          )}
          <ul className="grid gap-2.5">
            {p.best.map((piece) => (
              <li key={piece.id} className="grid gap-1 rounded-[14px] bg-sheet-2 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href={piece.url}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 text-[0.95rem] font-[600] text-ink hover:text-brand"
                  >
                    {piece.hook || piece.text}
                  </a>
                  {piece.ratio !== null && (
                    <span className="shrink-0 rounded-full bg-marker px-2 py-0.5 text-[0.76rem] font-[760] text-on-marker">
                      {piece.ratio.toLocaleString('es-CO')}×
                    </span>
                  )}
                </div>
                <p className="text-[0.8rem] text-ink-3">
                  {FORMAT[piece.format] ?? piece.format},{' '}
                  {fmtDate.format(new Date(piece.publishedAt))}
                  {piece.views ? `, ${fmtCompact(piece.views)} vistas` : ''}
                  {piece.likes ? `, ${fmtCompact(piece.likes)} me gusta` : ''}
                  {piece.topics.length > 0 &&
                    `. Tema: ${piece.topics.map((t) => t.name).join(', ')}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default function ReferencesPage() {
  const { data } = useApi<{ profiles: Profile[]; gaps: RadarTopic[] }>('/api/v1/references');
  return (
    <Page className="grid gap-8">
      <PageHeader
        title="Lo que le funciona a 30X"
        lead="Los perfiles de referencia que 30X compartió para el reto, medidos contra su propia mediana. Cada pieza de 30X se compara con lo que suele hacer 30X, no con una cuenta de un millón de seguidores."
      />
      {!data && <Skeleton className="h-96" />}
      {data && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {data.profiles.map((p) => (
              <ProfileCard key={`${p.platform}-${p.name}`} p={p} />
            ))}
          </div>
          <section className="grid gap-3">
            <h2 className="t-h2 text-ink">Crecen y 30X todavía no los ha tocado</h2>
            {data.gaps.length === 0 ? (
              <Empty title="30X ya cubrió todo lo que crece esta semana" />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.gaps.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/tema/${t.id}`}
                      className="sheet grid h-full content-start gap-2 p-4 transition hover:-translate-y-0.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StageTag stage={t.stage} />
                        <span className="t-figure text-ink">{fmtGrowth(t.growthPct)}</span>
                      </div>
                      <p className="font-[700] text-ink">{t.name}</p>
                      {t.why && <p className="line-clamp-2 text-[0.88rem] text-ink-2">{t.why}</p>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
