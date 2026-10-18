'use client';

/**
 * The calendar's dialogs: move a piece to another day or hour, add a piece to a day (one of the
 * team's maquetas, or a topic marked «Sirve» that still has no piece) and confirm before a piece
 * leaves the calendar.
 */
import clsx from 'clsx';
import { ArrowRight, CalendarClock, Clock, LayoutTemplate } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { linkBtn } from './calendario-format';
import { StageChip } from './kit';
import { FORMAT_SPEC, MaquetaThumb } from './maqueta';
import { Button, Dialog, Skeleton, fmtGrowth } from './ui';
import { addDays, dayLong, dayRelative, fmtHour, todayIso } from '@/lib/dates';
import { useApi } from '@/lib/hooks';
import type { CalendarEntry, Maqueta, RadarTopic } from '@/lib/types';

/** The hours a social team usually posts at, Bogotá time (the same as «Programar»). */
const HOURS = ['07:00', '09:00', '12:00', '15:00', '18:00', '20:00'];

const chip = (on: boolean) =>
  clsx(
    'inline-flex h-10 items-center justify-center rounded-[10px] border px-3 text-[0.88rem] font-[650] whitespace-nowrap transition tabular-nums',
    on ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink hover:border-rule-strong',
  );

const input =
  'h-10 rounded-[10px] border border-rule-strong bg-sheet px-3 text-[0.9rem] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15';

/** Closes a sentence without doubling the period of «9:00 a. m.». */
export const sentenceEnd = (s: string) => (s.endsWith('.') ? s : `${s}.`);

/** Pieces of a day by hour; the ones without an hour close the day. */
export const byHour = (a: CalendarEntry, b: CalendarEntry) =>
  (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99') ||
  a.approvedAt.localeCompare(b.approvedAt);

/** «El jueves 22 de octubre está libre.» or what it already holds. */
function dayHolds(day: string, pieces: CalendarEntry[]): string {
  if (pieces.length === 0) return `El ${dayLong(day)} está libre.`;
  const list = pieces
    .map((e) => `${fmtHour(e.scheduledTime) ?? 'sin hora'} · ${e.format}`)
    .join('; ');
  return `El ${dayLong(day)} ya tiene ${pieces.length === 1 ? 'una pieza' : `${pieces.length} piezas`}: ${list}.`;
}

// ------------------------------------------------------------------ move

export type MoveTo = { scheduledFor: string; scheduledTime?: string | null };

/** «Mover…»: a new day and hour for a piece already on the calendar. */
export function MoveDialog({
  entry,
  entries,
  onOpenChange,
  onMove,
}: {
  entry: CalendarEntry | null;
  entries: CalendarEntry[];
  onOpenChange: (open: boolean) => void;
  onMove: (entry: CalendarEntry, to: MoveTo) => void;
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title="Mover la pieza"
      description={entry ? <span className="line-clamp-2">{entry.title}</span> : undefined}
    >
      {entry && (
        <MoveForm
          key={entry.id}
          entry={entry}
          entries={entries}
          onSubmit={(to) => {
            onOpenChange(false);
            onMove(entry, to);
          }}
        />
      )}
    </Dialog>
  );
}

function MoveForm({
  entry,
  entries,
  onSubmit,
}: {
  entry: CalendarEntry;
  entries: CalendarEntry[];
  onSubmit: (to: MoveTo) => void;
}) {
  const [today] = useState(todayIso);
  const [date, setDate] = useState(entry.scheduledFor);
  const [time, setTime] = useState<string | null>(entry.scheduledTime ?? null);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const sameDay = entries.filter((e) => e.id !== entry.id && e.scheduledFor === date).sort(byHour);
  const changed = date !== entry.scheduledFor || time !== (entry.scheduledTime ?? null);

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) onSubmit({ scheduledFor: date, scheduledTime: time });
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[0.88rem] font-[700] text-ink">Día</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {week.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => setDate(d)}
              className={chip(d === date)}
            >
              {dayRelative(d, today)}
            </button>
          ))}
        </div>
        <label className="mt-1 flex flex-wrap items-center gap-2 text-[0.86rem] text-ink-2">
          Otra fecha
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className={input}
          />
        </label>
        <p className="text-[0.84rem] text-ink-2" role="status">
          {dayHolds(date, sameDay)}
        </p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[0.88rem] font-[700] text-ink">Hora</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {HOURS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={h === time}
              onClick={() => setTime(h)}
              className={chip(h === time)}
            >
              {fmtHour(h)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={time === null}
            onClick={() => setTime(null)}
            className={chip(time === null)}
          >
            Sin hora
          </button>
        </div>
        <label className="mt-1 flex flex-wrap items-center gap-2 text-[0.86rem] text-ink-2">
          <Clock className="size-4" aria-hidden />
          Otra hora
          <input
            type="time"
            value={time ?? ''}
            onChange={(e) => setTime(e.target.value || null)}
            className={input}
          />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-rule pt-4">
        <Button
          type="submit"
          variant="primary"
          disabled={!changed}
          icon={<CalendarClock className="size-4" aria-hidden />}
          className="rounded-[10px]!"
        >
          Mover
        </Button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ add

/**
 * «Agregar al lunes 19 de octubre»: the team's maquetas (picking one schedules it) and the topics
 * that serve and still have no piece (their draft is reviewed and approved on its own page).
 */
export function AddDialog({
  day,
  open,
  onOpenChange,
  waiting,
  onPickMaqueta,
}: {
  /** The day the piece goes to; null when the team picks it after. */
  day: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waiting: RadarTopic[];
  onPickMaqueta: (maqueta: Maqueta) => void;
}) {
  const { data: maquetas, error } = useApi<Maqueta[]>(open ? '/api/v1/maquetas' : null);
  const usable = (maquetas ?? []).filter((m) => m.slides.length > 0);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={day ? `Agregar al ${dayLong(day)}` : 'Agregar al calendario'}
      description="Programa una maqueta del equipo o revisa el borrador de un tema que sirve."
    >
      <div className="grid gap-6">
        <section className="grid gap-3" aria-labelledby="add-maquetas">
          <h3 id="add-maquetas" className="text-[0.92rem] font-[700] text-ink">
            Maquetas del equipo
          </h3>
          {error && !maquetas ? (
            <p className="rounded-[12px] bg-sheet-2 px-4 py-3 text-[0.88rem] text-ink-2">
              No pudimos traer las maquetas. Intenta de nuevo en un momento.
            </p>
          ) : !maquetas ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-[12px]" />
              ))}
            </div>
          ) : usable.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-sheet-2 px-4 py-3">
              <p className="text-[0.88rem] text-ink-2">Todavía no hay maquetas guardadas.</p>
              <Link href="/maquetas/nueva" className={linkBtn.outline}>
                <LayoutTemplate className="size-4" aria-hidden />
                Armar una maqueta
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5">
              {usable.map((m) => (
                <li key={m.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onPickMaqueta(m)}
                    className="grid w-full content-start gap-2 rounded-[12px] border border-rule bg-sheet p-2 text-left transition hover:border-ink"
                  >
                    <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-[8px] bg-sheet-2">
                      <div style={{ width: m.format === 'historia' ? '70%' : '100%' }}>
                        <MaquetaThumb maqueta={m} />
                      </div>
                    </div>
                    <div className="grid min-w-0 gap-0.5 px-0.5">
                      <span className="line-clamp-2 text-[0.84rem] leading-snug font-[650] break-words text-ink">
                        {m.name}
                      </span>
                      <span className="text-[0.74rem] text-ink-3">
                        {FORMAT_SPEC[m.format].label}
                        {m.slides.length > 1 ? ` · ${m.slides.length} láminas` : ''}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="grid gap-3" aria-labelledby="add-temas">
          <h3 id="add-temas" className="text-[0.92rem] font-[700] text-ink">
            Temas que sirven, sin pieza todavía
          </h3>
          {waiting.length === 0 ? (
            <p className="rounded-[12px] bg-sheet-2 px-4 py-3 text-[0.88rem] text-ink-2">
              Ningún tema marcado «Sirve» espera pieza.
            </p>
          ) : (
            <ul className="grid gap-2">
              {waiting.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border border-rule bg-sheet px-4 py-3"
                >
                  <div className="grid min-w-0 gap-1">
                    <p className="font-[700] break-words text-ink">{t.name}</p>
                    <p className="flex flex-wrap items-center gap-2 text-[0.82rem] text-ink-2 tabular-nums">
                      <StageChip stage={t.stage} />
                      {fmtGrowth(t.growthPct)} en creadores
                    </p>
                  </div>
                  <Link
                    href={`/tema/${t.id}/contar${day ? `?dia=${day}` : ''}`}
                    className={linkBtn.outline}
                  >
                    Revisar borrador
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="border-t border-rule pt-4 text-[0.88rem] text-ink-2">
          ¿Buscas otro tema?{' '}
          <Link
            href="/elegir"
            className="inline-flex items-center gap-1 font-[700] text-brand hover:underline"
          >
            Ir a Elegir <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ remove

/** What stays saved when a piece leaves the calendar. */
function keeps(entry: CalendarEntry): string {
  const kept = [
    entry.maquetaId ? 'la maqueta' : null,
    entry.adaptationId ? 'el borrador del tema' : null,
    entry.origin?.kind === 'vigia' ? 'la pieza en Vigía' : null,
  ].filter(Boolean);
  if (kept.length === 0) return 'Solo sale del calendario.';
  const list = kept.length > 1 ? `${kept.slice(0, -1).join(', ')} y ${kept.at(-1)}` : kept[0];
  return `Solo sale del calendario: ${list} ${kept.length > 1 ? 'siguen guardados' : 'sigue guardado'}.`;
}

/** Asks before a piece leaves the calendar. */
export function RemoveDialog({
  entry,
  onOpenChange,
  onRemove,
}: {
  entry: CalendarEntry | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (entry: CalendarEntry) => void;
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title="¿Quitar del calendario?"
      description={entry ? <span className="line-clamp-2">{entry.title}</span> : undefined}
    >
      {entry && (
        <div className="grid gap-5">
          <p className="text-[0.92rem] text-ink-2">
            {sentenceEnd(
              `Estaba para el ${dayLong(entry.scheduledFor)}${entry.scheduledTime ? `, ${fmtHour(entry.scheduledTime)}` : ''}`,
            )}{' '}
            {keeps(entry)}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => onOpenChange(false)} className="rounded-[10px]!">
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onOpenChange(false);
                onRemove(entry);
              }}
              className="rounded-[10px]!"
            >
              Quitar
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
