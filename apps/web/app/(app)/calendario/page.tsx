'use client';

/**
 * «Calendario»: the week of pieces the team approved, Monday to Friday, and the topics marked
 * «sirve» in Elegir that still have no piece on the calendar.
 */
import clsx from 'clsx';
import { Check, ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormatChip, FormatTile, formatKind, linkBtn } from '@/components/calendario-format';
import { Card, PageHead, StageChip, table } from '@/components/kit';
import { Page } from '@/components/shell';
import { Skeleton, fmtGrowth } from '@/components/ui';
import { ApiError, del } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { CalendarEntry, Radar, RadarTopic } from '@/lib/types';
import { useDecisions, useProfile } from '@/lib/workspace';

// ------------------------------------------------------------------ dates (YYYY-MM-DD, UTC)

const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => toIso(toMs(iso) + n * DAY_MS);
/** The Monday of the week that holds this day. */
const mondayOf = (iso: string) => addDays(iso, -((new Date(toMs(iso)).getUTCDay() + 6) % 7));

const fmtDayShort = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' });
const fmtMonth = new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'UTC' });
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const month = (iso: string) => fmtMonth.format(new Date(toMs(iso))).replace('.', '');
/** «LUN 20». */
const dayLabel = (iso: string) =>
  `${fmtDayShort
    .format(new Date(toMs(iso)))
    .replace('.', '')
    .slice(0, 3)} ${dayNum(iso)}`;
/** «20–24 oct», or «27 oct – 1 nov» across months. */
function weekLabel(monday: string) {
  const friday = addDays(monday, 4);
  return month(monday) === month(friday)
    ? `${dayNum(monday)}–${dayNum(friday)} ${month(friday)}`
    : `${dayNum(monday)} ${month(monday)} – ${dayNum(friday)} ${month(friday)}`;
}

/** Today in Bogotá, as YYYY-MM-DD. */
const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

/** This week, unless it is empty: then the week of the first piece still to come. */
function defaultMonday(entries: CalendarEntry[], today: string) {
  const current = mondayOf(today);
  const friday = addDays(current, 4);
  if (entries.some((e) => e.scheduledFor >= current && e.scheduledFor <= friday)) return current;
  const next = entries
    .map((e) => e.scheduledFor)
    .filter((d) => d >= today)
    .sort()[0];
  return next ? mondayOf(next) : current;
}

// ------------------------------------------------------------------ pieces

/** One approved piece inside its day column. */
function EntryCard({
  entry,
  onRemove,
}: {
  entry: CalendarEntry;
  onRemove: (e: CalendarEntry) => void;
}) {
  const kind = formatKind(entry.format);
  return (
    <article className="grid content-start gap-2.5">
      <FormatTile kind={kind} className="h-24 w-full sm:h-[110px]" />
      <FormatChip kind={kind} />
      <p className="line-clamp-3 text-[1.02rem] leading-snug font-[700] text-ink">{entry.title}</p>
      <Link
        href={`/tema/${entry.topicId}`}
        className="w-fit text-[0.86rem] text-ink-2 hover:text-brand"
      >
        {entry.topicName}
      </Link>
      <p className="flex items-start gap-1 text-[0.78rem] font-[700] text-st-emergente">
        <Check className="mt-px size-3.5 shrink-0" strokeWidth={3} aria-hidden />
        <span>Aprobado por {entry.approvedBy}</span>
      </p>
      <div className="flex gap-1.5 border-t border-rule pt-2.5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-rule px-2.5 text-[0.8rem] font-[600] text-ink hover:border-rule-strong"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(entry.body);
              toast('Copiado');
            } catch {
              toast.error('No se pudo copiar.');
            }
          }}
        >
          <Copy className="size-3.5" aria-hidden /> Copiar
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[0.8rem] font-[600] text-held hover:bg-held-tint"
          onClick={() => onRemove(entry)}
        >
          <Trash2 className="size-3.5" aria-hidden /> Quitar
        </button>
      </div>
    </article>
  );
}

/** A day of the week: its pieces on a white card, or a dashed box that invites to pick a topic. */
function DayColumn({
  day,
  entries,
  onRemove,
}: {
  day: string;
  entries: CalendarEntry[];
  onRemove: (e: CalendarEntry) => void;
}) {
  const label = (
    <p className="font-mono text-[0.72rem] tracking-[0.12em] text-ink-2 uppercase">
      {dayLabel(day)}
    </p>
  );
  if (entries.length === 0)
    return (
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-dashed border-rule-strong px-4 py-4 lg:min-h-[300px] lg:flex-col lg:items-stretch lg:justify-start lg:p-[18px]">
        {label}
        <p className="text-[0.88rem] text-ink-2 lg:my-auto lg:text-center">
          Libre ·{' '}
          <Link
            href="/elegir"
            className="font-[700] text-marker-strong underline underline-offset-2"
          >
            elegir un tema
          </Link>
        </p>
      </div>
    );
  return (
    <div className="grid content-start gap-3 rounded-[14px] border border-rule bg-sheet p-[18px] lg:min-h-[300px]">
      {label}
      <div className="grid gap-5 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-5">
        {entries.map((e) => (
          <EntryCard key={e.id} entry={e} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

export default function CalendarPage() {
  const { data, mutate } = useApi<CalendarEntry[]>('/api/v1/calendar');
  const { data: radar } = useApi<Radar>('/api/v1/radar');
  const [profile] = useProfile();
  const [decisions] = useDecisions();
  const [today] = useState(todayIso);
  const [picked, setPicked] = useState<string | null>(null);

  const entries = data ?? [];
  const monday = picked ?? defaultMonday(entries, today);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const weekend = entries.filter(
    (e) => e.scheduledFor > addDays(monday, 4) && e.scheduledFor <= addDays(monday, 6),
  );

  const remove = async (entry: CalendarEntry) => {
    try {
      await del(`/api/v1/calendar/${entry.id}`);
      await mutate();
      toast('Salió del calendario', { description: entry.title });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo quitar.');
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

  return (
    <Page className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHead
        crumbs={[{ label: 'Planear', href: '/elegir' }, { label: 'Calendario' }]}
        title="Lo que el equipo aprobó"
        lead="Cada pieza aprobada queda aquí con su formato, tema y responsable."
        actions={
          <>
            <div className="inline-flex h-10 items-center rounded-[9px] border border-rule bg-sheet">
              <button
                type="button"
                aria-label="Semana anterior"
                className="grid h-full w-9 place-items-center text-ink-2 hover:text-ink"
                onClick={() => setPicked(addDays(monday, -7))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="min-w-[88px] text-center text-[0.9rem] font-[700] text-ink tabular-nums">
                {weekLabel(monday)}
              </span>
              <button
                type="button"
                aria-label="Semana siguiente"
                className="grid h-full w-9 place-items-center text-ink-2 hover:text-ink"
                onClick={() => setPicked(addDays(monday, 7))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            <Link href="/elegir" className={linkBtn.primary}>
              <Plus className="size-4" strokeWidth={2.5} aria-hidden /> Agregar pieza
            </Link>
          </>
        }
      />

      {!data ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-5">
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              entries={entries.filter((e) => e.scheduledFor === day)}
              onRemove={remove}
            />
          ))}
        </div>
      )}
      {weekend.length > 0 && (
        <p className="-mt-2 text-[0.86rem] text-ink-2">
          Y {weekend.length === 1 ? 'una pieza' : `${weekend.length} piezas`} para el fin de semana:{' '}
          {weekend.map((e) => e.topicName).join(', ')}.
        </p>
      )}

      <Card title="Borradores esperando aprobación">
        {!radar ? (
          <Skeleton className="h-28" />
        ) : waiting.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-[10px] bg-sheet-2 px-4 py-5 text-[0.92rem] text-ink-2">
            <p>
              No hay temas esperando. Los que el equipo marque «Sirve» en Elegir aparecen aquí hasta
              que su pieza quede aprobada.
            </p>
            <Link href="/elegir" className={linkBtn.outline}>
              Ir a Elegir
            </Link>
          </div>
        ) : (
          <div className={table.wrap}>
            <table className={clsx(table.table, 'min-w-[680px]')}>
              <thead>
                <tr>
                  <th className={table.th}>Pieza</th>
                  <th className={table.th}>Formato</th>
                  <th className={table.th}>Tema</th>
                  <th className={table.th}>Responsable</th>
                  <th className={table.th}>
                    <span className="sr-only">Acción</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((t) => (
                  <tr key={t.id}>
                    <td className={table.td}>
                      <span className="flex items-center gap-3">
                        <FormatTile kind="pendiente" className="size-10" />
                        <span className="font-[500]">{t.name}</span>
                      </span>
                    </td>
                    <td className={table.td}>
                      <FormatChip kind="pendiente" />
                    </td>
                    <td className={table.td}>
                      <span className="flex flex-wrap items-center gap-2">
                        <StageChip stage={t.stage} />
                        <span className="text-[0.86rem] text-ink-2 tabular-nums">
                          {fmtGrowth(t.growthPct)}
                        </span>
                      </span>
                    </td>
                    <td className={table.td}>Equipo {profile.name}</td>
                    <td className={clsx(table.td, 'text-right')}>
                      <Link href={`/tema/${t.id}/contar`} className={linkBtn.outline}>
                        Revisar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Page>
  );
}
