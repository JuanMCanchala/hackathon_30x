import { OUTCOME_LABEL, STATUS_LABEL } from '@recibido/domain';
import clsx from 'clsx';
import type { CSSProperties } from 'react';
import type { BillStatus, Outcome } from '@/lib/types';

/** Each outcome's ink (text-*) — the outcome is never carried by color alone. */
export const OUTCOME_INK: Record<Outcome, string> = {
  PAY: 'text-pay',
  PAY_PART: 'text-part',
  ASK_VENDOR: 'text-ask',
  ESCALATE: 'text-escalate',
  HOLD: 'text-hold',
};

const STATUS_INK: Record<BillStatus, string> = {
  RECEIVED: 'text-ink-2',
  PAID: 'text-pay',
  PART_PAID: 'text-part',
  AWAITING_VENDOR: 'text-ask',
  ESCALATED: 'text-escalate',
  HELD: 'text-hold',
  APPROVED: 'text-pay',
  REJECTED: 'text-hold',
  SUPERSEDED: 'text-ink-3',
};

const STAMP_SIZE = {
  sm: 'px-2 py-1 text-[0.6875rem]',
  md: 'px-3 py-1.5 text-[0.875rem]',
  lg: 'px-4 py-2.5 text-[clamp(1.125rem,0.9rem+1vw,1.6rem)] border-2',
} as const;

/**
 * The receiving stamp. `land` plays the landing (after `delayMs`); render it with a `key` on the
 * outcome so it lands on a decision change, never on a re-render or a poll refresh.
 */
export function OutcomeStamp({
  outcome,
  size = 'md',
  land = false,
  delayMs = 0,
  className,
}: {
  outcome: Outcome;
  size?: keyof typeof STAMP_SIZE;
  land?: boolean;
  delayMs?: number;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'stamp',
        STAMP_SIZE[size],
        OUTCOME_INK[outcome],
        land && 'stamp-land',
        className,
      )}
      style={land ? ({ '--delay': `${delayMs}ms` } as CSSProperties) : undefined}
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/** The bill's status; cross-fades when it changes live (keyed on the status). */
export function StatusChip({ status, className }: { status: BillStatus; className?: string }) {
  return (
    <span
      key={status}
      className={clsx(
        'fade-in inline-flex items-center rounded-[6px] px-2 py-0.5 text-[0.8125rem] font-[650] whitespace-nowrap',
        'bg-[color-mix(in_srgb,currentColor_10%,var(--sheet))]',
        STATUS_INK[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
