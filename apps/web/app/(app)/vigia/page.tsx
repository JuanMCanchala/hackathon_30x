'use client';

/**
 * Vigía: follow a topic and OndAI searches it every hour in English (US and India) and
 * Portuguese. Free rules screen the candidates; only the caught pieces spend model tokens.
 * Layout from the mockup: follow form, followed topics as chips, the caught pieces on the left
 * and the last search's funnel on the right.
 */
import { Loader2, RefreshCw, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHead, Pill } from '@/components/kit';
import { Page } from '@/components/shell';
import { Empty, Skeleton, fmtInt } from '@/components/ui';
import { HitCard } from '@/components/vigia-hit';
import { LastSearch } from '@/components/vigia-search';
import { ago, darkBtn } from '@/components/vigia-ui';
import { ApiError, del, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { WatchDetail, WatchSummary } from '@/lib/types';

const fmtTime = new Intl.DateTimeFormat('es-CO', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Bogota',
});

/** How many caught pieces show before «Ver más». */
const FIRST = 8;

const every = (minutes: number) =>
  minutes === 60 ? 'busca cada hora' : `busca cada ${fmtInt(minutes)} min`;

// ------------------------------------------------------------------ follow

function FollowForm({ onFollowed }: { onFollowed: (id: string) => void }) {
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setBusy(true);
    try {
      const created = await post<{ id: string; term: string }>('/api/v1/watches', { term });
      setTerm('');
      onFollowed(created.id);
      toast('Siguiendo el tema', {
        description: `Primera búsqueda de «${created.term}» en curso.`,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo seguir el tema.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex w-full items-center gap-2.5">
      <label htmlFor="term" className="sr-only">
        Tema a seguir
      </label>
      <input
        id="term"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Escribe un tema… (ej. «negocios»)"
        maxLength={60}
        className="h-11 min-w-0 flex-1 rounded-[10px] border border-rule-strong bg-sheet px-3.5 text-[0.95rem] text-ink outline-none placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      <button type="submit" disabled={busy} className={`${darkBtn} h-11 px-5`}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {busy ? 'Preparando…' : 'Seguir'}
      </button>
    </form>
  );
}

// ------------------------------------------------------------------ followed topic

function WatchView({
  detail,
  onChanged,
  onStopped,
}: {
  detail: WatchDetail;
  onChanged: () => void;
  onStopped: () => void;
}) {
  const { watch, hits } = detail;
  const [all, setAll] = useState(false);
  const best = [...hits].sort((a, b) => b.score - a.score);
  const shown = all ? best : best.slice(0, FIRST);

  const searchNow = async () => {
    try {
      await post(`/api/v1/watches/${watch.id}/run`, {});
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo buscar ahora.');
    }
  };
  const stop = async () => {
    try {
      await del(`/api/v1/watches/${watch.id}`);
      onStopped();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo dejar de seguir.');
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.84rem] text-ink-3">
        <p role="status" className="min-w-0">
          {watch.running
            ? 'Buscando ahora en YouTube, Bluesky, Hacker News e Instagram. Tarda unos minutos.'
            : [
                watch.lastRunAt && `Última búsqueda ${ago(watch.lastRunAt)}`,
                watch.nextRunAt &&
                  `la próxima a las ${fmtTime.format(new Date(watch.nextRunAt)).replace(/\.$/, '')}`,
              ]
                .filter(Boolean)
                .join(' · ') || 'Todavía no ha buscado.'}
        </p>
        <span className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={searchNow}
            disabled={watch.running}
            className="inline-flex items-center gap-1 font-[650] text-brand hover:underline disabled:opacity-50 max-lg:-my-2.5 max-lg:py-2.5"
          >
            <RefreshCw
              className={watch.running ? 'size-3.5 animate-spin' : 'size-3.5'}
              aria-hidden
            />
            {watch.running ? 'Buscando…' : 'Buscar ahora'}
          </button>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1 font-[650] text-ink-2 hover:text-ink hover:underline max-lg:-my-2.5 max-lg:py-2.5"
          >
            <X className="size-3.5" aria-hidden />
            Dejar de seguir
          </button>
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21.5rem]">
        <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-[14px] border border-rule bg-sheet p-4 sm:p-5">
          <h2 className="text-[1rem] font-[700] text-ink">Atrapadas · las mejores primero</h2>
          {hits.length ? (
            <>
              <ol className="grid gap-4">
                {shown.map((h) => (
                  <HitCard
                    key={h.piece.id}
                    hit={h}
                    watchId={watch.id}
                    term={watch.term}
                    onAdapted={onChanged}
                  />
                ))}
              </ol>
              {best.length > FIRST && (
                <button
                  type="button"
                  onClick={() => setAll((a) => !a)}
                  className="justify-self-start text-[0.88rem] font-[650] text-brand hover:underline max-lg:-my-2.5 max-lg:py-2.5"
                >
                  {all ? 'Ver menos' : `Ver ${fmtInt(best.length - FIRST)} más`}
                </button>
              )}
            </>
          ) : (
            <p className="py-8 text-center text-[0.92rem] text-ink-2">
              {watch.running
                ? 'Lo que pase todas las reglas aparece aquí apenas termine la búsqueda.'
                : 'Ninguna pieza pasó todas las reglas todavía. La próxima búsqueda vuelve a intentarlo.'}
            </p>
          )}
        </section>
        <LastSearch detail={detail} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function WatchPage() {
  const { data: watches, mutate } = useApi<WatchSummary[]>('/api/v1/watches');
  const [chosen, setSelected] = useState<string | null>(null);
  // The first followed topic is open until another one is chosen.
  const selected =
    (watches?.some((w) => w.id === chosen) ? chosen : null) ?? watches?.[0]?.id ?? null;
  const {
    data: detail,
    error,
    mutate: refresh,
  } = useApi<WatchDetail>(selected ? `/api/v1/watches/${selected}` : null, {
    refreshInterval: (d) => (d?.watch.running ? 3000 : 60_000),
  });
  // keepPreviousData would show the last topic for a moment: only show the chosen one.
  const current = detail?.watch.id === selected ? detail : undefined;

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <PageHead
        crumbs={[{ label: 'Descubrir', href: '/radar' }, { label: 'Vigía' }]}
        title="Sigue un tema"
        lead="OndAI lo busca cada hora y te trae solo las piezas que despegan."
      />
      <FollowForm
        onFollowed={(id) => {
          setSelected(id);
          void mutate();
        }}
      />

      {watches && watches.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Temas que sigues">
          {watches.map((w) => {
            const on = w.id === selected;
            const label = [
              w.term,
              w.running ? 'buscando…' : `${fmtInt(w.caught)} atrapadas`,
              on && current ? every(current.watch.everyMinutes) : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pill
                key={w.id}
                role="tab"
                on={on}
                aria-selected={on}
                aria-pressed={undefined}
                onClick={() => setSelected(w.id)}
                className="max-w-full"
              >
                <span className="truncate">{on ? label : w.term}</span>
              </Pill>
            );
          })}
        </div>
      )}

      {selected ? (
        error ? (
          <Empty title="No encontramos ese tema" />
        ) : current ? (
          <WatchView
            key={selected}
            detail={current}
            onChanged={() => {
              void refresh();
              void mutate();
            }}
            onStopped={() => {
              setSelected(null);
              void mutate();
            }}
          />
        ) : (
          <Skeleton className="h-96" />
        )
      ) : (
        watches && (
          <Empty title="Todavía no sigues ningún tema">
            Escribe uno arriba, por ejemplo «negocios». La primera búsqueda empieza enseguida.
          </Empty>
        )
      )}
    </Page>
  );
}
