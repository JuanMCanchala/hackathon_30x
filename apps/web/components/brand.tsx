import clsx from 'clsx';

/** OndAI's mark: an orange paper plane, as on the landing. */
export function PlaneMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 104 80" className={clsx('h-[23px] w-[30px]', className)} aria-hidden>
      <polygon points="4,36 98,4 56,76" fill="#FF4F00" />
      <polyline
        points="98,4 44,46 56,76"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The wordmark: the plane and OndAI, heavy and tight. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <PlaneMark />
      <span className="text-[1.3rem] leading-none font-[800] tracking-[-0.03em]">OndAI</span>
    </span>
  );
}
