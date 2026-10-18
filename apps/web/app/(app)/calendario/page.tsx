'use client';

/**
 * «Calendario»: the week of pieces the team approved, Monday to Sunday, as many per day as the
 * team plans, each at its hour; and the topics marked «sirve» in Elegir that still have no piece.
 */
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AddDialog,
  MoveDialog,
  RemoveDialog,
  sentenceEnd,
  type MoveTo,
} from '@/components/calendario-dialogs';
import { WaitingDrafts } from '@/components/calendario-drafts';
import { linkBtn } from '@/components/calendario-format';
import { WeekBoard } from '@/components/calendario-week';
import { PageHead } from '@/components/kit';
import { ScheduleDialog } from '@/components/schedule-dialog';
import { Page } from '@/components/shell';
import { Button, Skeleton } from '@/components/ui';
import { ApiError, del, patch } from '@/lib/api';
import {
  addDays,
  dayLong,
  dayNum,
  fmtHour,
  mondayOf,
  monthShort,
  todayIso,
  toMs,
} from '@/lib/dates';
import { useApi } from '@/lib/hooks';
import type { CalendarEntry, Maqueta, Radar, RadarTopic } from '@/lib/types';
import { useDecisions, useProfile } from '@/lib/workspace';

/** «19–25 oct», or «26 oct – 1 nov» across months. */
function weekLabel(monday: string) {
  const sunday = addDays(monday, 6);
  return monthShort(monday) === monthShort(sunday)
    ? `${dayNum(monday)}–${dayNum(sunday)} ${monthShort(sunday)}`
    : `${dayNum(monday)} ${monthShort(monday)} – ${dayNum(sunday)} ${monthShort(sunday)}`;
}

/** «Esta semana», «Próxima semana», «Hace 2 semanas»… */
function weekFromNow(monday: string, today: string) {
  const n = Math.round((toMs(monday) - toMs(mondayOf(today))) / (7 * 86_400_000));
  if (n === 0) return 'Esta semana';
  if (n === 1) return 'Próxima semana';
  if (n === -1) return 'Semana pasada';
  return n > 0 ? `En ${n} semanas` : `Hace ${-n} semanas`;
}

/** This week, unless it is empty and a later week has pieces: then the first of those. */
function defaultMonday(entries: CalendarEntry[], today: string) {
  const current = mondayOf(today);
  const sunday = addDays(current, 6);
  if (entries.some((e) => e.scheduledFor >= current && e.scheduledFor <= sunday)) return current;
  const later = entries
    .map((e) => e.scheduledFor)
    .filter((d) => d > sunday)
    .sort()[0];
  return later ? mondayOf(later) : current;
}

const sentence = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export default function CalendarPage() {
  const { data, error, mutate } = useApi<CalendarEntry[]>('/api/v1/calendar');
  const { data: radar } = useApi<Radar>('/api/v1/radar');
  const [profile] = useProfile();
  const [decisions] = useDecisions();
  const [today] = useState(todayIso);
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ day: string; n: number } | null>(null);
  const [adding, setAdding] = useState<{ day: string | null } | null>(null);
  const [scheduling, setScheduling] = useState<{ maqueta: Maqueta; day: string | null } | null>(
    null,
  );
  const [moving, setMoving] = useState<CalendarEntry | null>(null);
  const [removing, setRemoving] = useState<CalendarEntry | null>(null);

  const entries = data ?? [];
  const monday = picked ?? defaultMonday(entries, today);
  const sunday = addDays(monday, 6);
  const week = entries.filter((e) => e.scheduledFor >= monday && e.scheduledFor <= sunday);
  /** The first day of the week still ahead, for «Agregar pieza» without a day. */
  const firstOpen = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).find((d) => d >= today);

  const goToday = () => {
    setPicked(mondayOf(today));
    setFocus((f) => ({ day: today, n: (f?.n ?? 0) + 1 }));
  };

  /** Moves a piece (keeping what `to` leaves out) and shows the week it lands in. */
  const move = async (entry: CalendarEntry, to: MoveTo) => {
    setPicked(mondayOf(to.scheduledFor));
    const next = { ...entry, ...to };
    try {
      await mutate(
        async (current) => {
          const saved = await patch<CalendarEntry>(`/api/v1/calendar/${entry.id}`, to);
          return (current ?? []).map((e) => (e.id === saved.id ? saved : e));
        },
        {
          optimisticData: (current) => (current ?? []).map((e) => (e.id === entry.id ? next : e)),
          rollbackOnError: true,
          revalidate: true,
        },
      );
      const hour = fmtHour(next.scheduledTime) ?? 'sin hora';
      toast('Pieza movida', {
        description: sentenceEnd(`${sentence(dayLong(next.scheduledFor))}, ${hour}`),
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo mover.');
    }
  };

  const remove = async (entry: CalendarEntry) => {
    setPicked(monday);
    try {
      await mutate(
        async (current) => {
          await del(`/api/v1/calendar/${entry.id}`);
          return (current ?? []).filter((e) => e.id !== entry.id);
        },
        {
          optimisticData: (current) => (current ?? []).filter((e) => e.id !== entry.id),
          rollbackOnError: true,
          revalidate: true,
        },
      );
      toast('Salió del calendario', { description: entry.title });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo quitar.');
    }
  };

  // Topics the team said «sirve» to in Elegir that have no piece on the calendar yet.
  const known = new Map<string, RadarTopic>();
  for (const t of [
    ...(radar?.topics ?? []),
    ...(radar?.forming ?? []),
    ...(radar?.windowsOpen ?? []),
  ])
    known.set(t.id, t);
  const scheduled = new Set(entries.map((e) => e.topicId));
  const waiting = Object.entries(decisions)
    .filter(([id, d]) => d === 'sirve' && !scheduled.has(id) && known.has(id))
    .map(([id]) => known.get(id) as RadarTopic);

  const relative = weekFromNow(monday, today);
  const lead =
    week.length > 0 ? (
      <p>
        <span className="font-[700] text-ink">{relative}</span> ·{' '}
        {week.length === 1 ? '1 pieza programada' : `${week.length} piezas programadas`}
      </p>
    ) : sunday < today ? (
      <p>
        <span className="font-[700] text-ink">{relative}</span> · No hubo piezas.
      </p>
    ) : (
      <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          <span className="font-[700] text-ink">{relative}</span> · Todavía no hay piezas. Elige un
          tema que sirva o agrega una maqueta a cualquier día.
        </span>
        <Link href="/elegir" className={linkBtn.outline}>
          Ir a Elegir
        </Link>
      </p>
    );

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHead
        crumbs={[{ label: 'Planear', href: '/elegir' }, { label: 'Calendario' }]}
        title="Lo que el equipo aprobó"
        lead="Cada pieza aprobada queda en su día y a su hora, con quién la aprobó. Un día puede tener varias."
        actions={
          <>
            <div className="inline-flex h-10 items-center rounded-[10px] border border-rule bg-sheet">
              <button
                type="button"
                aria-label="Semana anterior"
                className="grid h-full w-9 place-items-center rounded-l-[10px] text-ink-2 hover:text-ink"
                onClick={() => setPicked(addDays(monday, -7))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span
                className="min-w-[6.75rem] px-1 text-center text-[0.9rem] font-[700] whitespace-nowrap text-ink tabular-nums"
                aria-live="polite"
              >
                {weekLabel(monday)}
              </span>
              <button
                type="button"
                aria-label="Semana siguiente"
                className="grid h-full w-9 place-items-center rounded-r-[10px] text-ink-2 hover:text-ink"
                onClick={() => setPicked(addDays(monday, 7))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-10 items-center rounded-[10px] border border-rule bg-sheet px-3.5 text-[0.9rem] font-[650] text-ink transition hover:border-rule-strong"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setAdding({ day: null })}
              className={linkBtn.primary}
            >
              <Plus className="size-4" strokeWidth={2.5} aria-hidden /> Agregar pieza
            </button>
          </>
        }
      />

      {error && !data ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-rule bg-sheet px-5 py-4">
          <p className="text-[0.92rem] text-ink-2">No pudimos abrir el calendario.</p>
          <Button onClick={() => void mutate()} className="rounded-[10px]!">
            Reintentar
          </Button>
        </div>
      ) : !data ? (
        <div className="grid gap-2.5 md:grid-cols-3 xl:grid-cols-7 xl:gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton
              key={i}
              className={
                i > 2 ? 'hidden h-72 rounded-[14px] xl:block' : 'h-24 rounded-[14px] md:h-72'
              }
            />
          ))}
        </div>
      ) : (
        <WeekBoard
          monday={monday}
          today={today}
          entries={week}
          lead={lead}
          focus={focus}
          onAdd={(day) => setAdding({ day })}
          onMove={setMoving}
          onRemove={setRemoving}
          onDropTo={(entry, day) => void move(entry, { scheduledFor: day })}
        />
      )}

      <WaitingDrafts topics={waiting} loading={!radar} team={`Equipo ${profile.name}`} />

      <AddDialog
        day={adding?.day ?? null}
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        waiting={waiting}
        onPickMaqueta={(maqueta) => {
          setScheduling({ maqueta, day: adding?.day ?? firstOpen ?? null });
          setAdding(null);
        }}
      />
      <ScheduleDialog
        open={scheduling !== null}
        onOpenChange={(open) => !open && setScheduling(null)}
        source={{ maquetaId: scheduling?.maqueta.id ?? '' }}
        what={scheduling?.maqueta.name ?? ''}
        defaultDate={scheduling?.day ?? undefined}
        onScheduled={(entry) => setPicked(mondayOf(entry.scheduledFor))}
      />
      <MoveDialog
        entry={moving}
        entries={entries}
        onOpenChange={(open) => !open && setMoving(null)}
        onMove={(entry, to) => void move(entry, to)}
      />
      <RemoveDialog
        entry={removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        onRemove={(entry) => void remove(entry)}
      />
    </Page>
  );
}
