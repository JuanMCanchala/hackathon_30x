'use client';

import { Link2, RadioTower } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Page } from '@/components/shell';
import {
  Button,
  Empty,
  Field,
  Input,
  PageHeader,
  Skeleton,
  fmtCompact,
  fmtDateTime,
} from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { PLATFORM_COPY, type Platform } from '@/lib/types';

interface Submission {
  id: string;
  url: string;
  submittedBy: string;
  note: string | null;
  status: string;
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

export default function SensorPage() {
  const { data, mutate } = useApi<Submission[]>('/api/v1/sensor');
  const [url, setUrl] = useState('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Added | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const added = await post<Added>('/api/v1/sensor', {
        url: url.trim(),
        submittedBy: who.trim() || 'Equipo 30X',
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

  return (
    <Page className="grid gap-8">
      <PageHeader
        title="La comunidad como sensor"
        lead="LinkedIn, Instagram y TikTok no tienen una búsqueda pública. Cuando alguien del equipo o de la comunidad 30X ve un post que está funcionando, lo manda aquí: el radar lee su página pública, lo etiqueta y lo suma a su tema."
      />

      <section className="sheet grid gap-4 p-5 sm:p-6">
        <form
          onSubmit={send}
          className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end"
        >
          <Field label="Enlace del post público" htmlFor="url">
            <Input
              id="url"
              type="url"
              inputMode="url"
              placeholder="https://www.linkedin.com/posts/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </Field>
          <Field label="Quién lo manda" htmlFor="who">
            <Input
              id="who"
              placeholder="Tu nombre"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            icon={<RadioTower className="size-4" aria-hidden />}
          >
            {busy ? 'Leyendo el post…' : 'Mandar al radar'}
          </Button>
        </form>
        <p className="text-[0.86rem] text-ink-3">
          Sirve con posts públicos de LinkedIn, Instagram, TikTok, YouTube, X y Bluesky. El radar
          solo guarda el contenido público y el nombre del autor.
        </p>
        {last && (
          <div className="rounded-[14px] bg-brand-tint px-4 py-3">
            <p className="font-[700] text-ink">Entró: {last.title}</p>
            <p className="mt-1 text-[0.92rem] text-ink-2">
              {last.topics.length ? (
                <>
                  Sumó a{' '}
                  {last.topics.map((t, i) => (
                    <span key={t.id}>
                      {i > 0 && ', '}
                      <Link
                        href={`/tema/${t.id}`}
                        className="font-[650] text-brand hover:underline"
                      >
                        {t.name}
                      </Link>
                    </span>
                  ))}
                  .
                </>
              ) : (
                'Todavía no tiene un tema propio: el radar lo agrupará cuando lleguen piezas parecidas.'
              )}
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="t-h2 text-ink">Lo que ha llegado</h2>
        {!data && <Skeleton className="h-48" />}
        {data && data.length === 0 && (
          <Empty title="Todavía nadie ha mandado un post">
            El primero que llegue aparece aquí.
          </Empty>
        )}
        {data && data.length > 0 && (
          <ul className="sheet divide-y divide-rule overflow-hidden">
            {data.map((s) => (
              <li key={s.id} className="grid gap-1.5 px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 font-[650] text-ink hover:text-brand"
                  >
                    <Link2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">{s.piece?.title ?? s.url}</span>
                  </a>
                  <span className="text-[0.8rem] text-ink-3">
                    {s.submittedBy}, {fmtDateTime(s.createdAt)}
                  </span>
                </div>
                {s.piece ? (
                  <p className="text-[0.88rem] text-ink-2">
                    {PLATFORM_COPY[s.piece.platform]}, {s.piece.authorName}
                    {s.piece.likes ? `, ${fmtCompact(s.piece.likes)} reacciones` : ''}
                    {s.piece.comments ? `, ${fmtCompact(s.piece.comments)} comentarios` : ''}
                    {s.topics.length > 0 && (
                      <>
                        {'. Tema: '}
                        {s.topics.map((t, i) => (
                          <span key={t.id}>
                            {i > 0 && ', '}
                            <Link
                              href={`/tema/${t.id}`}
                              className="font-[600] text-brand hover:underline"
                            >
                              {t.name}
                            </Link>
                          </span>
                        ))}
                      </>
                    )}
                  </p>
                ) : (
                  <p className="text-[0.88rem] text-held">
                    No se pudo leer: el post es privado o la red no lo muestra sin sesión.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
