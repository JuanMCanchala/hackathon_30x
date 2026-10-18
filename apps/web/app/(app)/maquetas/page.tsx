'use client';

/**
 * «Maquetas»: the team's post designs. Each one is designed once, reused for another topic with
 * the same look, downloaded as PNG and scheduled on the calendar.
 */
import clsx from 'clsx';
import {
  ArrowRight,
  Check,
  LayoutTemplate,
  ListChecks,
  Lock,
  Plus,
  Repeat2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DarkNote, MonoLabel, PageHead } from '@/components/kit';
import { FORMAT_SPEC, MaquetaSlideView, PRESETS, styleFrom } from '@/components/maqueta';
import {
  FormatGlyph,
  ReuseDialog,
  SlideFit,
  agoText,
  blankSlides,
  brandFrom,
  originLabel,
  slidesCount,
  useNow,
} from '@/components/maqueta-kit';
import { Page } from '@/components/shell';
import { Button, Empty, Skeleton } from '@/components/ui';
import { ApiError, del } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Maqueta } from '@/lib/types';
import { useProfile } from '@/lib/workspace';

const outline =
  'inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-rule-strong bg-sheet px-3 text-[0.86rem] font-[650] whitespace-nowrap text-ink transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-50';

const primaryLink =
  'inline-flex h-10 items-center gap-2 rounded-[10px] bg-marker px-4 text-[0.92rem] font-[650] text-on-marker transition hover:bg-marker-strong';

const secondaryLink =
  'inline-flex h-10 items-center gap-2 rounded-[10px] border border-rule-strong bg-sheet px-4 text-[0.92rem] font-[650] text-ink transition hover:border-ink';

/** The cover in front, the second slide fanned out behind it, like the deck in Elegir. */
function CardArt({ m }: { m: Maqueta }) {
  const first = m.slides[0];
  const second = m.slides[1];
  if (!first) return null;
  return (
    <SlideFit format={m.format} box={4 / 3} fill={0.76}>
      <div className="relative">
        {second && (
          <div className="absolute inset-0 origin-bottom-left translate-x-[9%] rotate-[6deg] opacity-90 transition-transform duration-300 ease-out group-hover:translate-x-[15%] group-hover:rotate-[9deg]">
            <MaquetaSlideView
              format={m.format}
              style={m.style}
              slide={{ ...second, kicker: '', title: '', body: '' }}
              index={1}
              total={m.slides.length}
            />
          </div>
        )}
        <div className="relative rounded-[3%] shadow-[0_18px_36px_-18px_rgb(32_21_21/0.55)] transition-transform duration-300 ease-out group-hover:-translate-y-1">
          <MaquetaSlideView
            format={m.format}
            style={m.style}
            slide={first}
            index={0}
            total={m.slides.length}
          />
        </div>
      </div>
    </SlideFit>
  );
}

function MaquetaCard({
  m,
  basedOn,
  now,
  onReuse,
  onDeleted,
}: {
  m: Maqueta;
  basedOn: Maqueta | null;
  now: number;
  onReuse: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await del(`/api/v1/maquetas/${m.id}`);
      toast('Maqueta borrada', { description: m.name });
      onDeleted();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo borrar la maqueta.');
      setDeleting(false);
    }
  };

  return (
    <li className="group flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-rule bg-sheet transition hover:border-rule-strong">
      <Link
        href={`/maquetas/${m.id}`}
        aria-label={`Abrir ${m.name}`}
        className="relative block aspect-[4/3] overflow-hidden rounded-t-[13px] bg-sheet-2 focus-visible:rounded-t-[13px]"
      >
        <CardArt m={m} />
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-[7px] bg-sheet/90 px-2 py-1 text-[0.74rem] font-[650] text-ink shadow-sheet">
          <FormatGlyph format={m.format} size={14} />
          {FORMAT_SPEC[m.format].label}
        </span>
      </Link>

      <div className="grid gap-1 px-4 pt-3.5 pb-3">
        <h2 className="truncate text-[1rem] font-[700] text-ink">
          <Link href={`/maquetas/${m.id}`} className="hover:underline">
            {m.name}
          </Link>
        </h2>
        <p className="truncate text-[0.84rem] text-ink-2">
          {slidesCount(m.slides.length)} · {originLabel(m.origin)}
        </p>
        <p className="truncate text-[0.8rem] text-ink-3">
          Actualizada {agoText(m.updatedAt, now)}
          {basedOn && <> · basada en «{basedOn.name}»</>}
        </p>
      </div>

      <div className="mt-auto border-t border-rule px-4 py-3">
        {confirming ? (
          <div className="grid gap-2" role="group" aria-label={`Borrar ${m.name}`}>
            <p className="text-[0.84rem] text-ink">
              ¿Borrar esta maqueta? Lo que ya está en el calendario se queda con su texto.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="danger"
                loading={deleting}
                onClick={() => void remove()}
                icon={<Trash2 className="size-4" aria-hidden />}
              >
                Sí, borrar
              </Button>
              <Button size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/maquetas/${m.id}`} className={outline}>
              Abrir
            </Link>
            <button type="button" onClick={onReuse} className={outline}>
              <Repeat2 className="size-4" aria-hidden />
              Usar para otro post
            </button>
            <span className="flex-1" />
            {m.removable ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="grid size-9 place-items-center rounded-[9px] text-held transition hover:bg-held-tint"
                aria-label={`Borrar ${m.name}`}
                title="Borrar"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[0.76rem] text-ink-3"
                title="Es parte de la demo: puedes editarla y guardarla como copia."
              >
                <Lock className="size-3.5" aria-hidden />
                De la demo
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** No maquetas yet: the flow in three steps and the six styles a maqueta can start from. */
function EmptyLibrary() {
  const [profile] = useProfile();
  const brand = brandFrom(profile);
  const cover = blankSlides('post')[0]!;
  const steps = [
    {
      icon: ListChecks,
      title: 'Marca ✓ en Elegir',
      text: 'Quédate con los temas que le sirven a tu equipo.',
    },
    {
      icon: LayoutTemplate,
      title: 'Arma la maqueta',
      text: 'OndAI la llena con el texto del tema; tú ajustas colores, letra y marca.',
    },
    {
      icon: Repeat2,
      title: 'Reúsala y prográmala',
      text: 'Úsala para el próximo tema con el mismo diseño y llévala al calendario.',
    },
  ];
  return (
    <section className="overflow-hidden rounded-[14px] border border-rule bg-sheet">
      <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
        <div className="grid gap-6">
          <div>
            <MonoLabel>Todavía no hay maquetas</MonoLabel>
            <h2 className="mt-2 text-[1.5rem] leading-tight font-[700] tracking-[-0.02em] text-ink">
              Diseña el post una vez. Úsalo para cada tema nuevo.
            </h2>
            <p className="mt-2 text-[0.95rem] text-ink-2">
              Una maqueta guarda los colores, la letra, la marca y el ritmo de las láminas. El texto
              sale del tema y lo cambias cuando quieras.
            </p>
          </div>
          <ol className="grid gap-3">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#ffe9dd] text-marker-strong dark:bg-noche-3">
                  <Icon className="size-[1.05rem]" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.95rem] font-[700] text-ink">
                    {i + 1}. {title}
                  </span>
                  <span className="block text-[0.88rem] text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Link href="/elegir" className={primaryLink}>
              <ListChecks className="size-4" aria-hidden />
              Ir a Elegir
            </Link>
            <Link href="/maquetas/nueva" className={secondaryLink}>
              <Plus className="size-4" aria-hidden />
              Nueva maqueta en blanco
            </Link>
          </div>
        </div>
        <figure className="grid gap-3">
          <ul className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-hidden>
            {PRESETS.map((p, i) => (
              <li
                key={p.id}
                className={clsx(
                  'rounded-[3%] shadow-[0_14px_30px_-18px_rgb(32_21_21/0.6)]',
                  i % 2 ? 'rotate-[1.5deg]' : '-rotate-[1.5deg]',
                )}
              >
                <MaquetaSlideView format="post" style={styleFrom(p.id, brand)} slide={cover} />
              </li>
            ))}
          </ul>
          <figcaption className="text-center text-[0.8rem] text-ink-3">
            Seis estilos para empezar. Después cambias lo que quieras.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export default function MaquetasPage() {
  const { data, error, mutate } = useApi<Maqueta[]>('/api/v1/maquetas');
  const now = useNow();
  const [reuse, setReuse] = useState<Maqueta | null>(null);
  const byId = useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data]);

  return (
    <Page className="grid gap-6">
      <PageHead
        crumbs={[{ label: 'Planear', href: '/calendario' }, { label: 'Maquetas' }]}
        title="Maquetas del equipo"
        lead="Diseña el post una vez y reúsalo: cada tema nuevo entra con el mismo estilo."
        actions={
          data && data.length > 0 ? (
            <>
              <Link href="/maquetas/nueva" className={secondaryLink}>
                <Plus className="size-4" aria-hidden />
                Nueva en blanco
              </Link>
              <Link href="/elegir" className={primaryLink}>
                <Check className="size-4" aria-hidden />
                Armar desde Elegir
              </Link>
            </>
          ) : null
        }
      />

      {error && !data ? (
        <Empty
          title="No pudimos abrir las maquetas"
          action={
            <Button onClick={() => void mutate()} icon={<ArrowRight className="size-4" />}>
              Intentar de nuevo
            </Button>
          }
        >
          {error.message}
        </Empty>
      ) : !data ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="rounded-[14px] border border-rule bg-sheet">
              <Skeleton className="aspect-[4/3] rounded-b-none bg-sheet-2" />
              <div className="grid gap-2 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-fill" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-fill" />
              </div>
            </li>
          ))}
        </ul>
      ) : data.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((m) => (
            <MaquetaCard
              key={m.id}
              m={m}
              basedOn={m.basedOn ? (byId.get(m.basedOn) ?? null) : null}
              now={now}
              onReuse={() => setReuse(m)}
              onDeleted={() =>
                void mutate((list) => list?.filter((x) => x.id !== m.id), { revalidate: true })
              }
            />
          ))}
        </ul>
      )}

      <DarkNote>
        <ShieldCheck className="size-5 shrink-0" aria-hidden />
        Nada se publica solo: programas la maqueta y el equipo la publica ese día.
      </DarkNote>

      {reuse && (
        <ReuseDialog
          open={reuse !== null}
          onOpenChange={(open) => !open && setReuse(null)}
          maqueta={reuse}
        />
      )}
    </Page>
  );
}
