'use client';

/**
 * The week on the calendar, Monday to Sunday. Seven columns on a wide screen, a row of day columns
 * that scrolls sideways on a tablet and an agenda by day on a phone. A day holds any number of
 * pieces, sorted by hour; each one is a compact card (picture, hour, format, title, topic, who
 * approved it) with its actions in a «⋯» menu. With a mouse, a card can be dragged to another day.
 */
import * as Menu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  LayoutTemplate,
  Lock,
  Palette,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { byHour } from './calendario-dialogs';
import { FormatChip, FormatTile, formatKind, maquetaFormatOf } from './calendario-format';
import { MaquetaThumb } from './maqueta';
import { addDays, dayLong, dayShort, fmtHour } from '@/lib/dates';
import type { CalendarEntry } from '@/lib/types';

/** Visitors move and remove what they planned; the demo week's own pieces stay put. */
export const isLocked = (entry: CalendarEntry) => entry.removable === false;

const countLabel = (n: number) => (n === 0 ? 'Libre' : n === 1 ? '1 pieza' : `${n} piezas`);

// ------------------------------------------------------------------ one piece

/** The maqueta's first slide when there is one; else the format's tinted tile. */
function Thumb({ entry, className }: { entry: CalendarEntry; className?: string }) {
  if (entry.maqueta && entry.maqueta.slides.length > 0)
    return (
      <div
        className={clsx(
          'grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-[6px] bg-sheet-2',
          className,
        )}
        aria-hidden
      >
        <div style={{ width: entry.maqueta.format === 'historia' ? '70%' : '100%' }}>
          <MaquetaThumb maqueta={entry.maqueta} />
        </div>
      </div>
    );
  return (
    <FormatTile
      kind={formatKind(entry.format)}
      className={clsx('aspect-[4/5] w-full', className)}
    />
  );
}

/** Where the piece comes from: its topic, the Vigía term or the maqueta. */
function Origin({ entry, className }: { entry: CalendarEntry; className?: string }) {
  const cls = clsx(
    'line-clamp-2 w-fit max-w-full text-[0.74rem] leading-snug break-words text-ink-2 @min-[12rem]:text-[0.8rem]',
    className,
  );
  const link = clsx(cls, 'underline-offset-2 hover:text-brand hover:underline');
  if (entry.topicId)
    return (
      <Link href={`/tema/${entry.topicId}`} draggable={false} className={link}>
        {entry.topicName}
      </Link>
    );
  if (entry.origin?.kind === 'vigia')
    return (
      <Link href="/vigia" draggable={false} className={link}>
        Vigía · {entry.topicName}
      </Link>
    );
  if (entry.maquetaId)
    return (
      <Link href={`/maquetas/${entry.maquetaId}`} draggable={false} className={link}>
        {entry.topicName}
      </Link>
    );
  return <span className={cls}>{entry.topicName}</span>;
}

/** Menu rows inherit the ink of the menu; «Quitar» sets its own red. */
const item =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[0.88rem] font-[550] outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-fill [&_svg]:size-4 [&_svg]:shrink-0';

/** «⋯»: copy the text, open or build its maqueta, move it, take it off the calendar. */
function Actions({
  entry,
  onMove,
  onRemove,
  className,
}: {
  entry: CalendarEntry;
  onMove: (entry: CalendarEntry) => void;
  onRemove: (entry: CalendarEntry) => void;
  className?: string;
}) {
  const locked = isLocked(entry);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.body);
      toast('Texto copiado', { description: entry.title });
    } catch {
      toast.error('No se pudo copiar.');
    }
  };
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label={`Acciones de «${entry.title.slice(0, 60)}»`}
          className={clsx(
            'grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-2 transition hover:bg-fill hover:text-ink data-[state=open]:bg-fill data-[state=open]:text-ink',
            className,
          )}
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={4}
          collisionPadding={12}
          className="z-50 grid w-[15rem] max-w-[calc(100vw-24px)] rounded-[12px] border border-rule bg-sheet p-1 text-ink shadow-float"
        >
          <Menu.Item onSelect={copy} className={item}>
            <Copy className="text-ink-2" aria-hidden /> Copiar texto
          </Menu.Item>
          {entry.maquetaId ? (
            <Menu.Item asChild className={item}>
              <Link href={`/maquetas/${entry.maquetaId}`}>
                <LayoutTemplate className="text-ink-2" aria-hidden /> Abrir maqueta
              </Link>
            </Menu.Item>
          ) : entry.topicId ? (
            <Menu.Item asChild className={item}>
              <Link
                href={`/maquetas/nueva?tema=${entry.topicId}&formato=${maquetaFormatOf(formatKind(entry.format))}`}
              >
                <Palette className="text-ink-2" aria-hidden /> Armar maqueta
              </Link>
            </Menu.Item>
          ) : null}
          <Menu.Separator className="mx-1 my-1 h-px bg-rule" />
          <Menu.Item disabled={locked} onSelect={() => onMove(entry)} className={item}>
            <CalendarClock className="text-ink-2" aria-hidden /> Mover…
          </Menu.Item>
          <Menu.Item
            disabled={locked}
            onSelect={() => onRemove(entry)}
            className={clsx(item, 'text-held')}
          >
            <Trash2 aria-hidden /> Quitar
          </Menu.Item>
          {locked && (
            <p className="flex items-start gap-2 px-2.5 pt-1 pb-2 text-[0.78rem] leading-snug text-ink-3">
              <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
              Es parte de la semana de la demo
            </p>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * A piece in its day. Laid out by its own width: in a narrow column the picture sits next to the
 * hour and the text runs under them; from 12rem the picture takes the left edge.
 */
function EntryCard({
  entry,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
  onRemove,
}: {
  entry: CalendarEntry;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (entry: CalendarEntry) => void;
  onRemove: (entry: CalendarEntry) => void;
}) {
  const movable = !isLocked(entry);
  return (
    <article
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', entry.id);
        onDragStart(entry.id);
      }}
      onDragEnd={onDragEnd}
      className={clsx(
        '@container min-w-0 rounded-[10px] border border-rule bg-sheet p-2 transition hover:border-rule-strong',
        movable && 'md:cursor-grab md:active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1.5 @min-[12rem]:grid-cols-[2.75rem_minmax(0,1fr)_auto] @min-[12rem]:gap-x-2.5 @min-[12rem]:gap-y-1">
        <Thumb entry={entry} className="col-start-1 row-start-1 @min-[12rem]:row-span-4" />
        <p className="col-span-2 col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span
            className={clsx(
              'text-[0.72rem] font-[750] whitespace-nowrap tabular-nums @min-[12rem]:text-[0.8rem]',
              entry.scheduledTime ? 'text-ink' : 'text-ink-3',
            )}
          >
            {fmtHour(entry.scheduledTime) ?? 'Sin hora'}
          </span>
          <FormatChip kind={formatKind(entry.format)} size="sm" />
        </p>
        <h4
          title={entry.title}
          className="col-span-3 col-start-1 row-start-2 line-clamp-3 text-[0.8rem] leading-[1.28] font-[700] break-words text-ink @min-[12rem]:col-span-2 @min-[12rem]:col-start-2 @min-[12rem]:text-[0.9rem]"
        >
          {entry.title}
        </h4>
        <Origin
          entry={entry}
          className="col-span-3 col-start-1 row-start-3 @min-[12rem]:col-span-2 @min-[12rem]:col-start-2"
        />
        <p
          title={`Aprobado por ${entry.approvedBy}`}
          className="col-span-2 col-start-1 row-start-4 line-clamp-2 min-w-0 self-center text-[0.68rem] leading-snug font-[650] break-words text-st-emergente @min-[12rem]:col-span-1 @min-[12rem]:col-start-2 @min-[12rem]:text-[0.74rem]"
        >
          <Check className="mr-0.5 inline size-3 align-[-2px]" strokeWidth={3} aria-hidden />
          {/* A narrow column keeps the name; the check says it was approved. */}
          <span className="sr-only @min-[12rem]:not-sr-only">Aprobado por </span>
          {entry.approvedBy}
        </p>
        <Actions
          entry={entry}
          onMove={onMove}
          onRemove={onRemove}
          className="col-start-3 row-start-4 -mr-1 -mb-1 self-end"
        />
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ one day

function DayColumn({
  day,
  today,
  entries,
  draggingId,
  over,
  onAdd,
  onMove,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOverDay,
  onDropOn,
}: {
  day: string;
  today: string;
  entries: CalendarEntry[];
  draggingId: string | null;
  over: boolean;
  onAdd: (day: string) => void;
  onMove: (entry: CalendarEntry) => void;
  onRemove: (entry: CalendarEntry) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverDay: (day: string | null) => void;
  onDropOn: (day: string) => void;
}) {
  const isToday = day === today;
  const past = day < today;
  const count = countLabel(entries.length);
  const addLabel = `Agregar al ${dayLong(day)}`;
  return (
    <section
      data-day={day}
      aria-label={`${dayLong(day)}${isToday ? ', hoy' : ''}: ${count.toLowerCase()}`}
      onDragOver={(e) => {
        if (!draggingId || past) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!over) onDragOverDay(day);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragOverDay(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (!past) onDropOn(day);
      }}
      className={clsx(
        'flex min-w-0 scroll-mt-20 flex-col gap-1.5 rounded-[14px] p-1.5 transition-[background-color,box-shadow] md:min-h-[17rem] md:w-[15rem] md:shrink-0 md:snap-start xl:min-h-[19rem] xl:w-auto',
        over
          ? 'bg-marker/10 ring-2 ring-marker/60'
          : isToday
            ? 'bg-marker/[0.07] ring-1 ring-marker/35'
            : past
              ? 'bg-sheet-2/55'
              : 'bg-sheet-2',
      )}
    >
      <header className="flex min-h-9 items-center justify-between gap-2 px-1.5 pt-0.5 md:block md:min-h-0 md:pt-1 md:pb-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <h3
            className={clsx(
              'text-[0.95rem] font-[700] md:font-mono md:text-[0.74rem] md:font-[500] md:tracking-[0.1em] md:uppercase',
              past ? 'text-ink-3' : 'text-ink md:text-ink-2',
            )}
          >
            {dayShort(day)}
          </h3>
          {isToday && (
            <span className="rounded-full bg-marker px-1.5 py-px text-[0.66rem] font-[750] text-on-marker">
              Hoy
            </span>
          )}
          <p
            className={clsx(
              'text-[0.88rem] md:basis-full md:text-[0.74rem]',
              entries.length === 0 ? 'text-ink-3' : 'text-ink-2',
            )}
          >
            <span className="md:hidden" aria-hidden>
              ·{' '}
            </span>
            {count}
          </p>
        </div>
        {!past && (
          <button
            type="button"
            onClick={() => onAdd(day)}
            aria-label={addLabel}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-[9px] border border-rule-strong bg-sheet px-2.5 text-[0.8rem] font-[650] text-ink transition hover:border-ink md:hidden"
          >
            <Plus className="size-3.5" strokeWidth={2.5} aria-hidden /> Agregar
          </button>
        )}
      </header>

      {[...entries].sort(byHour).map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          dragging={draggingId === entry.id}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onMove={onMove}
          onRemove={onRemove}
        />
      ))}

      {!past && (
        <button
          type="button"
          onClick={() => onAdd(day)}
          aria-label={addLabel}
          className="hidden h-8 w-full shrink-0 items-center justify-center gap-1 rounded-[9px] border border-dashed border-rule-strong text-[0.8rem] font-[650] text-ink-2 transition hover:border-ink hover:bg-sheet hover:text-ink md:flex"
        >
          <Plus className="size-3.5" strokeWidth={2.5} aria-hidden /> Agregar
        </button>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ the week

/**
 * The seven days from `monday`. `focus` scrolls a day into view (the «Hoy» button); on a tablet the
 * row also opens on today when the week holds it.
 */
export function WeekBoard({
  monday,
  today,
  entries,
  lead,
  focus,
  onAdd,
  onMove,
  onRemove,
  onDropTo,
}: {
  monday: string;
  today: string;
  /** The week's pieces. */
  entries: CalendarEntry[];
  /** What the row above the days says on the left. */
  lead: ReactNode;
  focus: { day: string; n: number } | null;
  onAdd: (day: string) => void;
  onMove: (entry: CalendarEntry) => void;
  onRemove: (entry: CalendarEntry) => void;
  onDropTo: (entry: CalendarEntry, day: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // On a tablet the days scroll sideways: fade the edge that has more days behind it.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setEdges({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    el.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  // A new week opens on today when it holds it; each press of «Hoy» brings today into view once.
  const handledFocus = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const asked = focus !== null && focus.n !== handledFocus.current;
    if (focus) handledFocus.current = focus.n;
    const holdsToday = today >= monday && today <= addDays(monday, 6);
    const target = asked ? focus.day : holdsToday ? today : null;
    const column = target ? el.querySelector<HTMLElement>(`[data-day="${target}"]`) : null;
    if (el.scrollWidth > el.clientWidth + 1) {
      el.scrollTo({
        left: column ? column.offsetLeft - 6 : 0,
        behavior: asked ? 'smooth' : 'auto',
      });
    } else if (asked && column && !matchMedia('(min-width: 1280px)').matches) {
      column.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [monday, today, focus]);

  const scrollBy = (direction: 1 | -1) =>
    scroller.current?.scrollBy({ left: direction * 252, behavior: 'smooth' });

  const endDrag = () => {
    setDraggingId(null);
    setOver(null);
  };
  const movable = entries.some((e) => !isLocked(e));

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 text-[0.9rem] text-ink-2">{lead}</div>
        {movable && (
          <p className="hidden text-[0.84rem] text-ink-3 xl:block">
            Arrastra una pieza a otro día para moverla.
          </p>
        )}
        <div className="hidden items-center gap-2 md:flex xl:hidden">
          <span className="text-[0.84rem] text-ink-3">Desliza para ver los 7 días</span>
          <span className="inline-flex rounded-[9px] border border-rule bg-sheet">
            <button
              type="button"
              aria-label="Días anteriores"
              disabled={edges.start}
              onClick={() => scrollBy(-1)}
              className="grid size-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-35"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Días siguientes"
              disabled={edges.end}
              onClick={() => scrollBy(1)}
              className="grid size-8 place-items-center text-ink-2 hover:text-ink disabled:opacity-35"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </span>
        </div>
      </div>

      <div className="relative min-w-0">
        <div
          ref={scroller}
          className="relative grid gap-2.5 md:flex md:snap-x md:snap-mandatory md:items-stretch md:gap-2.5 md:overflow-x-auto md:overscroll-x-contain md:pb-2 xl:grid xl:grid-cols-7 xl:gap-2 xl:overflow-visible xl:pb-0"
        >
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              today={today}
              entries={entries.filter((e) => e.scheduledFor === day)}
              draggingId={draggingId}
              over={over === day}
              onAdd={onAdd}
              onMove={onMove}
              onRemove={onRemove}
              onDragStart={setDraggingId}
              onDragEnd={endDrag}
              onDragOverDay={setOver}
              onDropOn={(target) => {
                const dragged = entries.find((e) => e.id === draggingId);
                endDrag();
                if (dragged && dragged.scheduledFor !== target) onDropTo(dragged, target);
              }}
            />
          ))}
        </div>
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-linear-to-r from-panel to-transparent transition-opacity md:block xl:hidden',
            edges.start ? 'opacity-0' : 'opacity-100',
          )}
        />
        <div
          aria-hidden
          className={clsx(
            'pointer-events-none absolute inset-y-0 right-0 hidden w-14 bg-linear-to-l from-panel to-transparent transition-opacity md:block xl:hidden',
            edges.end ? 'opacity-0' : 'opacity-100',
          )}
        />
      </div>
    </div>
  );
}
