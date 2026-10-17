import clsx from 'clsx';

/** A signature flourish that ends in a tick: an agreement, signed. Draws itself once. */
const SIGNATURE =
  'M6 31C24 15 44 9 48 19c3 9-9 14-6 5 5-13 30-14 46-5 17 9 33 0 46-6 9-4 15 2 21 7l9-9 13-14';

export function Signature({
  className,
  draw = true,
  strokeWidth = 5,
}: {
  className?: string;
  draw?: boolean;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 196 40"
      className={clsx('signature', draw && 'signature-draw', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={SIGNATURE}
        pathLength={600}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The app icon: night ink with the signature in highlighter yellow. */
export function AppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#10163a" />
      <path
        d="M12 40c4-8 8-10 10-5s-2 7-1 3c2-6 9-6 13-2s9 1 12-3l3 3 5-6 3-4"
        fill="none"
        stroke="#ffe25c"
        strokeWidth={4.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The wordmark: "mandato" set tight in Bricolage, signed underneath in yellow. */
export function Logo({ className, draw = false }: { className?: string; draw?: boolean }) {
  return (
    <span className={clsx('relative inline-flex flex-col leading-none', className)}>
      <span className="font-display text-[1.55rem] font-[800] tracking-[-0.045em]">mandato</span>
      <Signature
        draw={draw}
        strokeWidth={6}
        className="-mt-1 ml-1 h-[0.7rem] w-[5.4rem] text-marker"
      />
    </span>
  );
}
