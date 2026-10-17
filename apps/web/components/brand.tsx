import clsx from 'clsx';
import { useId } from 'react';

/**
 * The mark is the proof bar in miniature: three solid ticks of evidence and a hatched remainder.
 */
export function Mark({ className }: { className?: string }) {
  const hatch = `rcb-hatch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={clsx('shrink-0', className)}>
      <defs>
        <pattern
          id={hatch}
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)"
        >
          <rect width="1.4" height="4" fill="currentColor" opacity="0.55" />
        </pattern>
      </defs>
      <rect
        x="1"
        y="9"
        width="30"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="4" y="12" width="5" height="8" rx="0.8" fill="currentColor" />
      <rect x="10.5" y="12" width="5" height="8" rx="0.8" fill="currentColor" />
      <rect x="17" y="12" width="4" height="8" rx="0.8" fill="var(--stamp)" />
      <rect x="22.5" y="12" width="5.5" height="8" fill={`url(#${hatch})`} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 text-ink', className)}>
      <Mark className="size-8" />
      <span className="text-[1.3rem] leading-none font-[900] tracking-[-0.02em] [font-stretch:112%]">
        Recibido
      </span>
    </span>
  );
}
