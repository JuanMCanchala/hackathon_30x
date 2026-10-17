import clsx from 'clsx';

/** The mark: a swell with a rider on its rising face, where the radar says to enter. */
export function WaveMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#ff6b2c" />
      <path
        d="M4 23.5 C 9 23.5, 11 21, 13.5 16.5 S 19 8.5, 22.5 8.5 S 27.5 12, 28 16"
        fill="none"
        stroke="#0c2730"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="12.6" cy="18.2" r="2.7" fill="#ffffff" stroke="#0c2730" strokeWidth="1.6" />
    </svg>
  );
}

/** The wordmark: Radar set expanded and heavy, with the 30X tag. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <WaveMark className="size-8" />
      <span className="font-display text-[1.4rem] leading-none font-[820] tracking-[-0.02em] [font-variation-settings:'wdth'_122]">
        Radar
      </span>
      <span className="rounded-[6px] border border-current/35 px-1.5 py-[1px] text-[0.72rem] font-[760] tracking-[0.02em] opacity-90">
        30X
      </span>
    </span>
  );
}
