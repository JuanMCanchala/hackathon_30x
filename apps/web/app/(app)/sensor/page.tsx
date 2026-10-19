'use client';

/**
 * Sensor: the team pastes a public post that is working and OndAI reads it, tags its topic and
 * adds it to the radar. KPIs for the last seven days, the paste form and the recent sends.
 * New sends from anyone arrive live: the app's event stream revalidates `GET /sensor`.
 */
import clsx from 'clsx';
import { Link2, Loader2, Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Card, IconTile, Kpi, PageHead } from '@/components/kit';
import { Page } from '@/components/shell';
import { Skeleton, fmtDateTime, fmtInt } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { PLATFORM_COPY, type Platform } from '@/lib/types';

interface Submission {
  id: string;
  url: string;
  submittedBy: string;
  note: string | null;
  status: 'added' | 'unreadable' | string;
  createdAt: string;
  piece: {
    id: string;
    platform: Platform;
    authorName: string;
    title: string;
    likes: number | null;
    comments: number | null;
    views: number | null;
    hook: string | null;
  } | null;
  topics: { id: string; name: string }[];
}

interface Added {
  id: string;
  title: string;
  platform: Platform;
  topics: { id: string; name: string }[];
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** How many sends show before «Ver todos». */
const FIRST = 8;

const darkBtn =
  'inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-ink px-5 text-[0.92rem] font-[650] text-sheet transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/** The platform a link belongs to, from the piece or, when it could not be read, its host. */
function platformOf(s: Submission): Platform | null {
  if (s.piece) return s.piece.platform;
  try {
    const host = new URL(s.url).hostname.replace(/^www\./, '');
    if (host.endsWith('linkedin.com')) return 'linkedin';
    if (host.endsWith('instagram.com')) return 'instagram';
    if (host.endsWith('tiktok.com')) return 'tiktok';
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host === 'x.com' || host.endsWith('twitter.com')) return 'x';
    if (host.endsWith('bsky.app')) return 'bluesky';
  } catch {
    // An odd URL just goes without a platform.
  }
  return null;
}

/** «linkedin.com/posts/…cornhole-FN1A»: the host, the first path segment and the tail. */
function shortUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return host;
    const rest = parts.slice(1).join('/');
    if (!rest) return `${host}/${parts[0]}`;
    return `${host}/${parts[0]}/${rest.length > 18 ? `…${rest.slice(-14)}` : rest}`;
  } catch {
    return raw;
  }
}

const TILE: Partial<Record<Platform, { label: string; cls: string }>> = {
  linkedin: { label: 'in', cls: 'bg-[#0a66c2] text-white' },
  instagram: {
    label: 'IG',
    cls: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white',
  },
  tiktok: { label: 'TT', cls: 'bg-ink text-sheet' },
  youtube: { label: 'YT', cls: 'bg-[#ff0000] text-white' },
  x: { label: 'X', cls: 'bg-ink text-sheet' },
  bluesky: { label: 'BS', cls: 'bg-[#1185fe] text-white' },
};

function PlatformTile({ platform }: { platform: Platform | null }) {
  const t = platform ? TILE[platform] : undefined;
  return (
    <span
      className={clsx(
        'grid size-11 shrink-0 place-items-center rounded-[10px] text-[0.82rem] font-[800]',
        t?.cls ?? 'bg-fill text-ink-3',
      )}
      aria-hidden
    >
      {t ? t.label : <Link2 className="size-4" />}
    </span>
  );
}

function TopicLinks({ topics }: { topics: { id: string; name: string }[] }) {
  return (
    <>
      {topics.map((t, i) => (
        <span key={t.id}>
          {i > 0 && (i === topics.length - 1 ? ' y ' : ', ')}
          <Link href={`/tema/${t.id}`} className="text-ink-2 hover:text-brand hover:underline">
            «{t.name}»
          </Link>
        </span>
      ))}
    </>
  );
}

function SubmissionRow({ s }: { s: Submission }) {
  const platform = platformOf(s);
  const read = s.status !== 'unreadable' && s.piece !== null;
  // On phones the status goes under the text, so the link and its topics keep the width.
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-rule py-3.5 last:border-b-0 sm:flex">
      <PlatformTile platform={platform} />
      <div className="min-w-0 flex-1">
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer"
          title={s.piece?.title ?? s.url}
          className="block truncate text-[0.92rem] font-[700] text-ink hover:text-brand"
        >
          {shortUrl(s.url)}
        </a>
        <p className="text-[0.84rem] text-ink-2">
          {platform ? PLATFORM_COPY[platform] : 'Enlace'} ·{' '}
          {!read ? (
            'privado o no visible sin sesión'
          ) : s.topics.length ? (
            <>
              sumado a <TopicLinks topics={s.topics} />
            </>
          ) : (
            'todavía sin tema propio'
          )}
        </p>
        <p className="truncate text-[0.76rem] text-ink-3">
          {s.submittedBy}, {fmtDateTime(s.createdAt)}
        </p>
      </div>
      <span
        className={clsx(
          'col-start-2 shrink-0 justify-self-start rounded-[6px] px-2 py-[3px] text-[0.74rem] font-[700] whitespace-nowrap',
          read ? 'bg-st-emergente-tint text-st-emergente' : 'bg-held-tint text-held',
        )}
      >
        {read ? 'Leído' : 'No se pudo leer'}
      </span>
    </li>
  );
}

/**
 * Last seven days: what was sent, what joined a topic, and the topics the sensor had never
 * seen in an earlier send.
 */
function weekStats(data: Submission[], now: number) {
  const since = now - WEEK_MS;
  const week = data.filter((s) => new Date(s.createdAt).getTime() >= since);
  const before = new Set(
    data
      .filter((s) => new Date(s.createdAt).getTime() < since)
      .flatMap((s) => s.topics.map((t) => t.id)),
  );
  const fresh = new Set(
    week.flatMap((s) => s.topics.map((t) => t.id)).filter((id) => !before.has(id)),
  );
  return {
    sent: week.length,
    joined: week.filter((s) => s.status !== 'unreadable' && s.topics.length > 0).length,
    newTopics: fresh.size,
  };
}

export default function SensorPage() {
  const { data, mutate } = useApi<Submission[]>('/api/v1/sensor');
  const [now] = useState(() => Date.now());
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Added | null>(null);
  const [all, setAll] = useState(false);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const added = await post<Added>('/api/v1/sensor', {
        url: url.trim(),
        submittedBy: 'Equipo 30X',
      });
      setLast(added);
      setUrl('');
      await mutate();
      toast('Entró al radar', {
        description: added.topics.map((t) => t.name).join(', ') || 'Todavía sin tema propio',
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo leer ese enlace.');
    } finally {
      setBusy(false);
    }
  };

  const stats = data ? weekStats(data, now) : null;
  const shown = data ? (all ? data : data.slice(0, FIRST)) : [];

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHead
        crumbs={[{ label: 'Descubrir', href: '/radar' }, { label: 'Sensor' }]}
        title="Tu equipo también detecta"
        lead="Pega lo que veas funcionar en redes y OndAI lo suma al radar de la semana."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-3">
        <Kpi label="Enviados esta semana" value={stats ? fmtInt(stats.sent) : '—'} />
        <Kpi
          label="Sumados al radar"
          value={<span className="text-st-emergente">{stats ? fmtInt(stats.joined) : '—'}</span>}
        />
        <Kpi
          label="Temas nuevos detectados"
          value={
            <span className="text-marker-strong">{stats ? fmtInt(stats.newTopics) : '—'}</span>
          }
          note="Temas que el sensor no había visto antes."
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-2">
        <Card icon={<Link2 />} tone="orange" title="Pega lo que viste funcionar">
          <form onSubmit={send} className="flex items-center gap-2.5">
            <label htmlFor="url" className="sr-only">
              Enlace del post público
            </label>
            <input
              id="url"
              type="url"
              inputMode="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enlace de un post público (LinkedIn, Instagram, TikTok)"
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-rule-strong bg-sheet px-3.5 text-[0.95rem] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <button type="submit" disabled={busy} className={darkBtn}>
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {busy ? 'Leyendo…' : 'Enviar'}
            </button>
          </form>
          <p className="mt-3 text-[0.88rem] text-ink-2">
            También desde la extensión de Chrome, con un clic.
          </p>
          {last && (
            <p className="mt-3 rounded-[10px] bg-st-emergente-tint px-3.5 py-2.5 text-[0.88rem] text-ink">
              <span className="font-[700]">Entró: {last.title}.</span>{' '}
              {last.topics.length ? (
                <>
                  Sumó a <TopicLinks topics={last.topics} />.
                </>
              ) : (
                'Todavía sin tema propio: el radar lo agrupará cuando lleguen piezas parecidas.'
              )}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3.5 rounded-[12px] bg-sheet-2 p-4">
            <IconTile tone="lavender" className="size-11 rounded-[10px]">
              <Puzzle />
            </IconTile>
            <p className="text-[0.9rem] leading-relaxed text-ink">
              <span className="font-[700]">Cómo funciona:</span> OndAI lee el post, detecta el tema
              y lo compara con lo que ya está en el radar.
            </p>
          </div>
          <p className="mt-3 text-[0.78rem] text-ink-3">
            Sirve con posts públicos de LinkedIn, Instagram, TikTok, YouTube, X y Bluesky. Solo se
            guarda el contenido público y el nombre del autor.
          </p>
        </Card>

        <Card title="Enviados recientes">
          {!data && <Skeleton className="h-40" />}
          {data && data.length === 0 && (
            <p className="py-8 text-center text-[0.9rem] text-ink-2">
              Todavía nadie ha mandado un post. El primero que llegue aparece aquí.
            </p>
          )}
          {data && data.length > 0 && (
            <>
              <ul className="-mt-2">
                {shown.map((s) => (
                  <SubmissionRow key={s.id} s={s} />
                ))}
              </ul>
              {data.length > FIRST && (
                <button
                  type="button"
                  onClick={() => setAll((a) => !a)}
                  className="mt-2 text-[0.86rem] font-[650] text-brand hover:underline"
                >
                  {all ? 'Ver menos' : `Ver todos (${fmtInt(data.length)})`}
                </button>
              )}
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
