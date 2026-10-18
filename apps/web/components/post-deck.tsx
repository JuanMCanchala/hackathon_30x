'use client';

/**
 * Elegir's swipe deck for any cards. The front card drags and tilts, the next two wait fanned
 * behind it, and a decision sends the card off: right «Sirve», left «No sirve», down «Para
 * después». Same buttons, keys (← ↓ →), stamps and timing as the Elegir screen, so both read as
 * one gesture. The parent keeps the decisions; the deck only animates them.
 */
import clsx from 'clsx';
import { Bookmark, Check, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { IconTile } from './kit';
import { fmtInt } from './ui';
import type { Decision } from '@/lib/workspace';

/** Where the front card flies when a decision is made. */
const EXIT: Record<Decision, string> = {
  sirve: 'translateX(140%) rotate(16deg)',
  no: 'translateX(-140%) rotate(-16deg)',
  despues: 'translateY(70%) scale(0.85)',
};

/** How far a drag has to go to count as a decision. */
const SWIPE = 110;

/** The two places behind the front card. `--fan` is set per breakpoint on the stage. */
const LEFT = 'translateX(calc(var(--fan) * -1)) rotate(-8deg) scale(0.86)';
const RIGHT = 'translateX(var(--fan)) rotate(8deg) scale(0.86)';

/** Whoever handles the arrow keys itself (tabs, fields, menus) keeps them. */
const OWN_KEYS =
  'input, textarea, select, [contenteditable="true"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="listbox"], [role="slider"]';

/** Pressing these inside a card does what they say instead of starting a drag. */
const NO_DRAG = 'button, a, input, textarea, select, label, [data-no-drag]';

const FRAME =
  'relative overflow-hidden rounded-[22px] border-[3px] border-sheet bg-sheet shadow-float';

export interface DeckCard {
  id: string;
}

export function PostDeck<T extends DeckCard>({
  cards,
  onDecide,
  render,
  describe,
  keyboard = true,
  cardClassName,
  stageClassName,
}: {
  /** The cards still to decide, the front one first. */
  cards: T[];
  /** Called once the card has left the stage. */
  onDecide: (card: T, decision: Decision) => void;
  /** The card's face; `front` is false while it waits behind. */
  render: (card: T, front: boolean) => ReactNode;
  /** The card as a screen reader names it: «LinkedIn, gancho 2 de 3». */
  describe: (card: T) => string;
  /** Off while something on top (a dialog) needs the arrow keys. */
  keyboard?: boolean;
  /** The card's size. */
  cardClassName?: string;
  /** The stage's height and the fan's spread (`[--fan:…]`). */
  stageClassName?: string;
}) {
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const [drag, setDrag] = useState<{ x: number; dx: number } | null>(null);
  const [said, setSaid] = useState('');
  // The decision waiting for the card to fly off. If the deck closes first, it still counts.
  const pending = useRef<{ timer: number; commit: () => void } | null>(null);
  const front = cards[0];

  useEffect(
    () => () => {
      const waiting = pending.current;
      if (!waiting) return;
      window.clearTimeout(waiting.timer);
      waiting.commit();
    },
    [],
  );

  function choose(d: Decision) {
    if (!front || leaving) return;
    setLeaving(d);
    setDrag(null);
    setSaid(
      `${d === 'sirve' ? 'Sirve' : d === 'no' ? 'No sirve' : 'Para después'}: ${describe(front)}.`,
    );
    const commit = () => {
      pending.current = null;
      onDecide(front, d);
    };
    pending.current = {
      commit,
      timer: window.setTimeout(() => {
        commit();
        setLeaving(null);
      }, 280),
    };
  }

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(OWN_KEYS)) return;
      const d: Decision | null =
        e.key === 'ArrowRight'
          ? 'sirve'
          : e.key === 'ArrowLeft'
            ? 'no'
            : e.key === 'ArrowDown'
              ? 'despues'
              : null;
      if (!d) return;
      e.preventDefault();
      choose(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A card that just took a place behind the front one fades in instead of popping.
  const fadeIn = useCallback((el: HTMLDivElement | null) => {
    if (el && el.dataset.place !== 'front')
      el.animate?.([{ opacity: 0 }, { opacity: 0.9 }], { duration: 260, easing: 'ease-out' });
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (leaving || e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest(NO_DRAG)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: e.clientX, dx: 0 });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag) setDrag({ x: drag.x, dx: e.clientX - drag.x });
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.dx > SWIPE) choose('sirve');
    else if (drag.dx < -SWIPE) choose('no');
    else setDrag(null);
  };

  const dx = drag?.dx ?? 0;
  // The card behind keeps its side as the deck advances: the side flips with the count.
  const nextOnLeft = cards.length % 2 === 0;

  return (
    <div className="min-w-0">
      <div
        className={clsx(
          'grid place-items-center [--fan:22px] sm:[--fan:150px] [&>*]:[grid-area:1/1]',
          stageClassName,
        )}
      >
        {cards.slice(0, 3).map((card, i) => {
          const isFront = i === 0;
          const behind = i === 1 ? (nextOnLeft ? LEFT : RIGHT) : nextOnLeft ? RIGHT : LEFT;
          const style: CSSProperties = isFront
            ? leaving
              ? { transform: EXIT[leaving], opacity: 0 }
              : drag
                ? { transform: `translateX(${dx}px) rotate(${dx / 18}deg)`, transition: 'none' }
                : { transform: 'none' }
            : { transform: behind, opacity: 0.9 };
          return (
            <div
              key={card.id}
              ref={fadeIn}
              data-place={isFront ? 'front' : 'behind'}
              style={{ ...style, zIndex: 3 - i }}
              className={clsx(
                FRAME,
                cardClassName,
                'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
                isFront
                  ? 'cursor-grab touch-pan-y select-none active:cursor-grabbing'
                  : 'pointer-events-none',
              )}
              inert={!isFront}
              aria-hidden={isFront ? undefined : true}
              role={isFront ? 'group' : undefined}
              aria-roledescription={isFront ? 'tarjeta' : undefined}
              aria-label={isFront ? describe(card) : undefined}
              onPointerDown={isFront ? onPointerDown : undefined}
              onPointerMove={isFront ? onPointerMove : undefined}
              onPointerUp={isFront ? onPointerUp : undefined}
              onPointerCancel={isFront ? () => setDrag(null) : undefined}
            >
              {render(card, isFront)}
              {isFront && drag && Math.abs(dx) > 30 && (
                <span
                  className={clsx(
                    'pointer-events-none absolute top-16 z-10 rounded-[8px] border-[3px] px-3 py-1 text-[1.1rem] font-[800] tracking-[0.06em] uppercase',
                    dx > 0
                      ? 'left-5 -rotate-12 border-marker bg-sheet/90 text-marker-strong'
                      : 'right-5 rotate-12 border-held bg-sheet/90 text-held',
                  )}
                  style={{ opacity: Math.min(1, Math.abs(dx) / SWIPE) }}
                  aria-hidden
                >
                  {dx > 0 ? 'Sirve' : 'No sirve'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-5 grid max-w-[420px] grid-cols-3 items-center justify-items-center gap-2">
        <button
          type="button"
          onClick={() => choose('no')}
          aria-label="No sirve (flecha izquierda)"
          className="grid size-[72px] place-items-center rounded-full border border-rule bg-sheet text-held shadow-sheet transition hover:-translate-y-0.5 hover:border-rule-strong"
        >
          <X className="size-7" strokeWidth={2.4} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => choose('despues')}
          aria-label="Para después (flecha abajo)"
          className="grid size-14 place-items-center rounded-full border border-rule bg-sheet text-brand shadow-sheet transition hover:-translate-y-0.5 hover:border-rule-strong"
        >
          <Bookmark className="size-5" strokeWidth={2.2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => choose('sirve')}
          aria-label="Sirve (flecha derecha)"
          className="grid size-[88px] place-items-center rounded-full bg-marker text-on-marker shadow-[0_12px_28px_-10px_rgb(255_79_0/0.7)] transition hover:-translate-y-0.5 hover:bg-marker-strong"
        >
          <Check className="size-9" strokeWidth={2.6} aria-hidden />
        </button>
        <span className="text-[0.92rem] text-ink-2">← No sirve</span>
        <span className="text-center text-[0.92rem] text-ink-2">Para después</span>
        <span className="text-[0.92rem] text-ink-2">Sirve →</span>
      </div>
      <p className="mt-3 hidden text-center text-[0.8rem] text-ink-3 sm:block">
        También con el teclado: ← no sirve, ↓ para después, → sirve.
      </p>
      <p className="sr-only" role="status">
        {said}
      </p>
    </div>
  );
}

/** «Revisaste los 6 posts»: what the deck left, and where to go next. */
export function DeckDone({
  title,
  note,
  counts,
  actions,
}: {
  title: string;
  note: ReactNode;
  counts: { label: string; value: number }[];
  actions: ReactNode;
}) {
  return (
    <section className="grid justify-items-center gap-4 rounded-[14px] border border-rule bg-sheet px-5 py-12 text-center">
      <IconTile tone="orange" className="size-14 rounded-[14px] [&_svg]:size-7!">
        <Check />
      </IconTile>
      <div>
        <h3 className="text-[1.3rem] font-[700] text-ink">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-[0.95rem] text-ink-2">{note}</p>
      </div>
      <dl className="grid w-full max-w-md grid-cols-3 gap-2">
        {counts.map((k) => (
          <div
            key={k.label}
            className="flex flex-col-reverse rounded-[12px] border border-rule px-3 py-3"
          >
            <dt className="mt-1.5 text-[0.8rem] text-ink-2">{k.label}</dt>
            <dd className="text-[1.6rem] leading-none font-[700] text-ink tabular-nums">
              {fmtInt(k.value)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap justify-center gap-2">{actions}</div>
    </section>
  );
}
