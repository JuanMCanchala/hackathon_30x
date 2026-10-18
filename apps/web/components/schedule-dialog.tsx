'use client';

/**
 * «Programar»: the day and the hour a piece goes out, from anywhere (a topic's draft, a maqueta,
 * a piece Vigía caught). A day can hold several pieces; the dialog shows what that day already
 * has so the team spaces them out.
 */
import clsx from 'clsx';
import { CalendarCheck2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { Button, Dialog } from './ui';
import { ApiError, post } from '@/lib/api';
import { addDays, dayLong, dayRelative, fmtHour, todayIso } from '@/lib/dates';
import { useApi } from '@/lib/hooks';
import type { CalendarEntry, ScheduleSource } from '@/lib/types';
import { useProfile } from '@/lib/workspace';

/** The hours a social team usually posts at, Bogotá time. */
const HOURS = ['07:00', '09:00', '12:00', '15:00', '18:00', '20:00'];

const chip = (on: boolean) =>
  clsx(
    'inline-flex h-10 items-center justify-center rounded-[10px] border px-3 text-[0.88rem] font-[650] whitespace-nowrap transition tabular-nums',
    on ? 'border-ink bg-ink text-sheet' : 'border-rule bg-sheet text-ink hover:border-rule-strong',
  );

/**
 * Opens on `open`; schedules `source` and calls `onScheduled` with the new entry. `what` names the
 * piece in the dialog («Carrusel de Instagram · Shadow AI»).
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  source,
  what,
  defaultDate,
  defaultTime = '09:00',
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: ScheduleSource;
  what: string;
  defaultDate?: string;
  defaultTime?: string | null;
  onScheduled?: (entry: CalendarEntry) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Programar en el calendario"
      description={what}
    >
      {/* Mounted only while open, so each opening starts from the defaults. */}
      {open && (
        <ScheduleForm
          source={source}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          onDone={(entry) => {
            onOpenChange(false);
            onScheduled?.(entry);
          }}
        />
      )}
    </Dialog>
  );
}

function ScheduleForm({
  source,
  defaultDate,
  defaultTime,
  onDone,
}: {
  source: ScheduleSource;
  defaultDate?: string;
  defaultTime: string | null;
  onDone: (entry: CalendarEntry) => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [profile] = useProfile();
  const [today] = useState(todayIso);
  const [date, setDate] = useState(defaultDate ?? addDays(today, 1));
  const [time, setTime] = useState<string | null>(defaultTime);
  const [by, setBy] = useState(`Equipo de medios ${profile.name}`);
  const [busy, setBusy] = useState(false);
  const { data: calendar } = useApi<CalendarEntry[]>('/api/v1/calendar');

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const sameDay = (calendar ?? [])
    .filter((e) => e.scheduledFor === date)
    .sort((a, b) => (a.scheduledTime ?? '99').localeCompare(b.scheduledTime ?? '99'));

  const submit = async () => {
    setBusy(true);
    try {
      const entry = await post<CalendarEntry>('/api/v1/calendar', {
        ...source,
        scheduledFor: date,
        scheduledTime: time,
        approvedBy: by.trim() || `Equipo de medios ${profile.name}`,
      });
      void mutate('/api/v1/calendar');
      toast('Quedó programado', {
        // «a. m.» already ends the sentence: no second period.
        description: `${entry.format}, ${dayLong(entry.scheduledFor)}${entry.scheduledTime ? `, ${fmtHour(entry.scheduledTime)}` : '.'}`,
        action: { label: 'Ver calendario', onClick: () => router.push('/calendario') },
      });
      onDone(entry);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo programar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
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
            className="h-10 rounded-[10px] border border-rule-strong bg-sheet px-3 text-[0.9rem] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </label>
        <p className="text-[0.84rem] text-ink-2" role="status">
          {sameDay.length === 0
            ? `El ${dayLong(date)} está libre.`
            : `El ${dayLong(date)} ya tiene ${sameDay.length === 1 ? 'una pieza' : `${sameDay.length} piezas`}: ${sameDay
                .map((e) => `${fmtHour(e.scheduledTime) ?? 'sin hora'}, ${e.format.toLowerCase()}`)
                .join('; ')}.`}
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
            className="h-10 rounded-[10px] border border-rule-strong bg-sheet px-3 text-[0.9rem] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </label>
      </fieldset>

      <label className="grid gap-1.5 text-[0.88rem] font-[700] text-ink">
        Lo aprueba
        <input
          value={by}
          maxLength={80}
          onChange={(e) => setBy(e.target.value)}
          className="h-10 rounded-[10px] border border-rule-strong bg-sheet px-3 text-[0.92rem] font-[400] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
        <p className="text-[0.82rem] text-ink-3">
          Nada se publica solo: el equipo lo publica ese día.
        </p>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          icon={<CalendarCheck2 className="size-4" aria-hidden />}
          className="rounded-[10px]!"
        >
          Programar
        </Button>
      </div>
    </form>
  );
}
