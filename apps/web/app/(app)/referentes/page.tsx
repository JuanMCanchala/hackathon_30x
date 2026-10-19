'use client';

/**
 * «Referentes»: the pieces from 30X and its reference profiles that most beat their own median,
 * and the growing topics 30X has not touched yet.
 */
import clsx from 'clsx';
import { ArrowUpRight, Building2, Sprout } from 'lucide-react';
import Link from 'next/link';
import { FormatChip, FormatTile, formatKind, linkBtn } from '@/components/calendario-format';
import { Card, IconTile, PageHead, table } from '@/components/kit';
import { Page } from '@/components/shell';
import { Skeleton, fmtCompact, fmtInt } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { PLATFORM_COPY, type Platform, type RadarTopic } from '@/lib/types';
import { useProfile } from '@/lib/workspace';

interface RefPiece {
  id: string;
  url: string;
  platform: Platform;
  publishedAt: string;
  format: string;
  text: string;
  hook: string | null;
  hookType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagement: number;
  ratio: number | null;
  topics: { id: string; name: string }[];
}

interface RefProfile {
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

const HOOK_TYPE: Record<string, string> = {
  contraintuitivo: 'Contraintuitivo',
  noticia: 'Noticia',
  lista: 'Lista',
  pregunta: 'Pregunta',
  historia: 'Historia',
  dato: 'Dato',
  promesa: 'Promesa',
  tutorial: 'Tutorial',
};

/** «@crece30x» from the profile's address. */
function handleOf(url: string) {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts.length > 0 ? `@${parts[parts.length - 1]}` : url;
  } catch {
    return url;
  }
}

/** «Líderes de ventas» → «líderes de ventas», but «CEOs» and «IA aplicada» keep their case. */
const lowerFirst = (s: string) =>
  /^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;

const FORMAT_WORD: Record<string, [string, string]> = {
  reel: ['reel', 'reels'],
  carousel: ['carrusel', 'carruseles'],
  image: ['imagen', 'imágenes'],
  post: ['post', 'posts'],
  video: ['video', 'videos'],
  short: ['video corto', 'videos cortos'],
};
const formatWord = (format: string, n: number) => {
  const w = FORMAT_WORD[format];
  return w ? w[n === 1 ? 0 : 1] : format;
};

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);
const ratioText = (r: number) => `${r.toLocaleString('es-CO', { maximumFractionDigits: 1 })}×`;

export default function ReferencesPage() {
  const { data } = useApi<{ profiles: RefProfile[]; gaps: RadarTopic[] }>('/api/v1/references');
  const [profile] = useProfile();

  const rows = (data?.profiles ?? [])
    .flatMap((p) => p.best.map((piece) => ({ piece, profile: p })))
    .sort((a, b) => (b.piece.ratio ?? 0) - (a.piece.ratio ?? 0));

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHead
        crumbs={[{ label: 'Planear', href: '/elegir' }, { label: 'Referentes' }]}
        title={`Lo que le funciona a ${profile.name}`}
        lead="Las piezas propias y de referentes que más superan su mediana."
        className="mb-1"
      />

      <div className="flex flex-col gap-3 rounded-[14px] border border-lavender bg-lavender-tint px-4 py-3.5 sm:flex-row sm:items-center">
        <span className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <IconTile tone="lavender" className="bg-sheet text-brand">
            <Building2 />
          </IconTile>
          <p className="text-[0.92rem] text-ink">
            Buscados con el perfil de <strong className="font-[700]">{profile.name}</strong>:
            audiencia {list(profile.audience.map(lowerFirst))} · pilares{' '}
            {list(profile.pillars.map(lowerFirst))} · voz{' '}
            {list(profile.voice.map((v) => v.toLowerCase()))}.
          </p>
        </span>
        <Link href="/empresa" className={clsx(linkBtn.outline, 'self-start sm:self-auto')}>
          Editar perfil
        </Link>
      </div>

      {!data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <Card>
            {rows.length === 0 ? (
              <p className="text-ink-2">Todavía no hay piezas capturadas de estos perfiles.</p>
            ) : (
              <>
                <ul className="-my-3.5 text-[0.93rem] xl:hidden">
                  {rows.map(({ piece, profile: p }) => {
                    const kind = formatKind(piece.format);
                    return (
                      <li key={piece.id} className="border-b border-rule py-3.5 last:border-b-0">
                        <a
                          href={piece.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-start gap-3 text-ink hover:text-brand"
                        >
                          <FormatTile kind={kind} className="size-10" />
                          <span className="grid min-w-0 gap-1.5">
                            <span className="line-clamp-2">{piece.hook || piece.text}</span>
                            <span className="text-[0.84rem] text-ink-2">
                              {handleOf(p.url)} · {PLATFORM_COPY[piece.platform] ?? piece.platform}
                            </span>
                            <span className="text-[0.84rem] text-ink-2">
                              <FormatChip kind={kind} className="mr-2" />
                              {piece.ratio !== null && (
                                <>
                                  <span
                                    className={clsx(
                                      'font-[700] tabular-nums',
                                      piece.ratio >= 3 ? 'text-marker-strong' : 'text-ink',
                                    )}
                                  >
                                    {ratioText(piece.ratio)}
                                  </span>{' '}
                                  su mediana
                                </>
                              )}
                              {piece.hookType && HOOK_TYPE[piece.hookType] && (
                                <>
                                  {' · '}
                                  <span className="text-ink">{HOOK_TYPE[piece.hookType]}</span>
                                </>
                              )}
                            </span>
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <div className={clsx(table.wrap, 'hidden xl:block')}>
                  <table className={clsx(table.table, 'min-w-[760px]')}>
                    <thead>
                      <tr>
                        <th className={table.th}>Pieza</th>
                        <th className={table.th}>Cuenta</th>
                        <th className={table.th}>Formato</th>
                        <th className={table.th}>× su mediana</th>
                        <th className={table.th}>Gancho / CTA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ piece, profile: p }) => {
                        const kind = formatKind(piece.format);
                        return (
                          <tr key={piece.id}>
                            <td className={clsx(table.td, 'max-w-[420px]')}>
                              <a
                                href={piece.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 hover:text-brand"
                              >
                                <FormatTile kind={kind} className="size-10" />
                                <span className="line-clamp-2">{piece.hook || piece.text}</span>
                              </a>
                            </td>
                            <td className={clsx(table.td, 'whitespace-nowrap')}>
                              {handleOf(p.url)}
                              <span className="block text-[0.76rem] text-ink-3">
                                {PLATFORM_COPY[piece.platform] ?? piece.platform}
                              </span>
                            </td>
                            <td className={table.td}>
                              <FormatChip kind={kind} />
                            </td>
                            <td
                              className={clsx(
                                table.td,
                                'font-[700] whitespace-nowrap tabular-nums',
                                piece.ratio !== null && piece.ratio >= 3 && 'text-marker-strong',
                              )}
                              title="Interacción frente a la mediana del propio perfil"
                            >
                              {piece.ratio !== null ? ratioText(piece.ratio) : '—'}
                            </td>
                            <td className={clsx(table.td, 'text-ink-2')}>
                              {piece.hookType && HOOK_TYPE[piece.hookType] ? (
                                <span className="text-ink">{HOOK_TYPE[piece.hookType]}</span>
                              ) : (
                                <span className="line-clamp-1 max-w-[220px]">
                                  {piece.hook ?? '—'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <section className="flex flex-col gap-4 rounded-[14px] border border-rule bg-sheet p-5 sm:flex-row sm:items-center">
            <IconTile tone="green" className="size-[52px] rounded-[12px] [&_svg]:size-5">
              <Sprout />
            </IconTile>
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.05rem] font-[700] text-ink">
                Temas que crecen y {profile.name} todavía no ha tocado
              </h2>
              {data.gaps.length === 0 ? (
                <p className="text-[0.9rem] text-ink-2">
                  {profile.name} ya cubrió todo lo que crece esta semana.
                </p>
              ) : (
                <p className="text-[0.9rem] text-ink-2">
                  {data.gaps.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ' · '}
                      <Link href={`/tema/${t.id}`} className="hover:text-brand hover:underline">
                        {t.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
            <Link
              href="/radar?untouched=1"
              className={clsx(linkBtn.primary, 'self-start sm:self-auto')}
            >
              Revisarlos
            </Link>
          </section>

          {data.profiles.length > 0 && (
            <Card title="Cómo se midió cada perfil">
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.profiles.map((p) => (
                  <li
                    key={`${p.platform}-${p.url}`}
                    className="grid content-start gap-1.5 rounded-[10px] bg-sheet-2 p-4"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-[700] text-ink">
                        {p.name}{' '}
                        <span className="text-[0.84rem] font-[500] text-ink-3">
                          en {PLATFORM_COPY[p.platform]}
                        </span>
                      </p>
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Ver perfil de ${p.name} en ${PLATFORM_COPY[p.platform]}`}
                        className="relative text-brand after:absolute after:-inset-3 hover:text-brand-strong"
                      >
                        <ArrowUpRight className="size-4" aria-hidden />
                      </a>
                    </div>
                    <p className="text-[0.84rem] text-ink-2">
                      {p.role}
                      {p.followers ? ` · ${fmtCompact(p.followers)} seguidores` : ''}
                    </p>
                    <p className="text-[0.84rem] text-ink-2">
                      {p.pieces === 0
                        ? 'Todavía no hay piezas capturadas.'
                        : `${fmtInt(p.pieces)} ${p.pieces === 1 ? 'pieza leída' : 'piezas leídas'}; una típica suma ${fmtCompact(p.medianEngagement)} interacciones.`}
                    </p>
                    {p.formats.length > 1 && (
                      <p className="text-[0.8rem] text-ink-3">
                        {p.formats
                          .map(
                            (f) =>
                              `${f.pieces} ${formatWord(f.format, f.pieces)} ${f.pieces === 1 ? 'rinde' : 'rinden'} ${ratioText(f.medianRatio)}`,
                          )
                          .join(' · ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
