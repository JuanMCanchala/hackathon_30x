/**
 * Hand-drawn line illustrations for the landing. One stroke weight, round ends, currentColor:
 * they read as ink on a contract, not as an icon set.
 */
import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

function Doodle({
  children,
  className,
  style,
  viewBox = '0 0 64 64',
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  viewBox?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type DoodleProps = { className?: string; style?: CSSProperties };

export const Pen = (p: DoodleProps) => (
  <Doodle {...p}>
    <path d="M44 8l12 12-26 26-14 3 3-14z" />
    <path d="M38 14l12 12M19 35l10 10" />
    <path d="M8 56c6-4 10-2 12 0s6 3 10-1 8-3 12 1" />
  </Doodle>
);

export const Coins = (p: DoodleProps) => (
  <Doodle {...p}>
    <ellipse cx="26" cy="16" rx="14" ry="5" />
    <path d="M12 16v8c0 3 6 5 14 5s14-2 14-5v-8" />
    <path d="M12 24v8c0 3 6 5 14 5s14-2 14-5v-8" />
    <ellipse cx="42" cy="42" rx="12" ry="4.5" />
    <path d="M30 42v7c0 2.5 5 4.5 12 4.5s12-2 12-4.5v-7" />
    <path d="M24 13.5h4" />
  </Doodle>
);

export const Stamp = (p: DoodleProps) => (
  <Doodle {...p}>
    <path d="M26 8h12v10c0 4 2 6 6 8h4c3 0 4 2 4 4v6H12v-6c0-2 1-4 4-4h4c4-2 6-4 6-8z" />
    <path d="M12 44h40" />
    <path d="M16 52c6 2 10-2 16 0s10 2 16-1" />
  </Doodle>
);

export const Shield = (p: DoodleProps) => (
  <Doodle {...p}>
    <path d="M32 6l20 7v14c0 14-9 24-20 31C21 51 12 41 12 27V13z" />
    <path d="M23 31l7 7 12-14" />
  </Doodle>
);

export const Envelope = (p: DoodleProps) => (
  <Doodle {...p}>
    <rect x="8" y="16" width="48" height="34" rx="5" />
    <path d="M10 19l22 17 22-17" />
    <path d="M45 8c3 1 4 4 3 6M51 9c2 2 2 5 0 7" />
  </Doodle>
);

export const Chat = (p: DoodleProps) => (
  <Doodle {...p}>
    <path d="M10 14c0-4 3-6 7-6h30c4 0 7 2 7 6v20c0 4-3 6-7 6H28l-12 10v-10h0c-4 0-6-2-6-6z" />
    <path d="M22 24h.5M32 24h.5M42 24h.5" strokeWidth={4} />
  </Doodle>
);

export const Contract = (p: DoodleProps) => (
  <Doodle {...p}>
    <path d="M14 6h26l12 12v40H14z" />
    <path d="M40 6v12h12" />
    <path d="M21 24h18M21 31h22M21 38h14" />
    <path d="M20 50c3-5 5-6 6-3s-1 4-1 2c1-4 6-4 9-1s6 0 8-2" />
  </Doodle>
);

export const Spark = ({ className, style }: DoodleProps) => (
  <svg viewBox="0 0 64 64" className={className} style={style} aria-hidden="true">
    <path
      d="M32 2c3 18 12 27 30 30-18 3-27 12-30 30-3-18-12-27-30-30C20 29 29 20 32 2z"
      fill="currentColor"
    />
  </svg>
);

/** A doodle that drifts slowly; tilt and delay keep a group from moving in lockstep. */
export function Floating({
  children,
  className,
  tilt = 0,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
  delay?: number;
}) {
  return (
    <span
      className={clsx('pointer-events-none absolute animate-float', className)}
      style={{ '--tilt': `${tilt}deg`, animationDelay: `${delay}ms` } as CSSProperties}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}
