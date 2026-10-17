'use client';

import clsx from 'clsx';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { formatMoney } from '@/lib/format';
import type { Currency } from '@/lib/types';

/** One evidence item inside the solid part; `weight` is its share (minutes, minor units...). */
export interface ProofTick {
  id: string;
  weight: number;
  label?: string;
}

const HEIGHT = { sm: 'h-2', md: 'h-4', lg: 'h-10' } as const;

/** Bar fill timing (docs/DESIGN.md): ticks land one after another, the whole fill ≤ 900 ms. */
const TICK_MS = 260;
const MAX_STAGGER_MS = 90;
const TOTAL_MS = 900;

export function fillDurationMs(ticks: number): number {
  if (ticks <= 1) return TICK_MS;
  return TICK_MS + (ticks - 1) * staggerMs(ticks);
}
function staggerMs(ticks: number): number {
  return ticks <= 1 ? 0 : Math.min(MAX_STAGGER_MS, (TOTAL_MS - TICK_MS) / (ticks - 1));
}

/** True once the element has been at least 40 % in the viewport. */
export function useInView(ref: RefObject<Element | null>, enabled = true): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, enabled]);
  return seen;
}

/**
 * Plays the `.rise-in` / `.stamp-land` entrances inside it once, when it first comes into view
 * (40 % visible). Before that they wait in their first frame.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} data-play={seen ? 'true' : 'false'} className={className}>
      {children}
    </div>
  );
}

/**
 * The product's protagonist: a bar as long as what was billed, solid where evidence proves it,
 * hatched where nothing does. Each evidence item is one tick. It fills once, when it first enters
 * the viewport; with reduced motion it shows the final state at once.
 */
export function ProofBar({
  billedMinor,
  evidencedMinor,
  ticks,
  currency,
  size = 'md',
  legend,
  play: controlled,
  className,
}: {
  billedMinor: number;
  evidencedMinor: number;
  ticks?: ProofTick[];
  currency: Currency;
  size?: keyof typeof HEIGHT;
  /** replaces the money legend (e.g. "92 h con prueba", "68 h sin prueba"); false hides it */
  legend?: false | { proven: string; unproven: string };
  /** controls the fill from outside (a parent that sequences more than the bar) */
  play?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, controlled === undefined);
  const play = controlled ?? seen;

  const billed = Math.max(billedMinor, 0);
  const proven = Math.min(Math.max(evidencedMinor, 0), billed);
  const share = billed > 0 ? proven / billed : 0;
  const items = proven > 0 ? (ticks?.length ? ticks : [{ id: 'all', weight: 1 }]) : [];
  const shown = legend === undefined && size !== 'sm';
  const text =
    legend ||
    (shown
      ? {
          proven: `${formatMoney(proven, currency)} con prueba`,
          unproven: `${formatMoney(billed - proven, currency)} sin prueba`,
        }
      : null);

  return (
    <span className={clsx('block', className)}>
      <span
        ref={ref}
        role="img"
        aria-label={`Con prueba ${formatMoney(proven, currency)} de ${formatMoney(billed, currency)} facturados`}
        data-play={play ? 'true' : 'false'}
        className={clsx('proof', HEIGHT[size])}
        style={{ '--stagger': `${staggerMs(items.length)}ms` } as CSSProperties}
      >
        <span className="proof-solid" style={{ width: `${share * 100}%` }}>
          {items.map((t, i) => (
            <span
              key={t.id}
              title={t.label}
              className="proof-tick"
              style={{ '--w': Math.max(t.weight, 0), '--i': i } as CSSProperties}
            />
          ))}
        </span>
      </span>
      {text && (
        <span className="t-mono mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-[0.8125rem] text-ink-2">
          <span className="inline-flex items-center gap-1.5 text-ink">
            <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-ink" />
            {text.proven}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="proof inline-block size-2.5 !w-2.5" />
            {text.unproven}
          </span>
        </span>
      )}
    </span>
  );
}
