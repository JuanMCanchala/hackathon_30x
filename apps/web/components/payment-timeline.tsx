'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { formatDate, formatMoney, maskDestination } from '@mandato/domain';
import type { PaymentView } from '@/lib/types';

const STEPS = ['Programado', 'Enviado', 'Llegó'] as const;

function stepIndex(status: PaymentView['status']): number {
  return status === 'scheduled' ? 0 : status === 'sent' ? 1 : 2;
}

/** The transfer's three moments, like a delivery tracker: programmed, sent, arrived. */
export function PaymentTimeline({ payment, compact }: { payment: PaymentView; compact?: boolean }) {
  const reached = stepIndex(payment.status);
  const dates = [
    formatDate(payment.scheduledFor),
    payment.sentAt ? formatDate(payment.scheduledFor) : null,
    payment.status === 'settled' && payment.expectedSettlement
      ? formatDate(payment.expectedSettlement)
      : payment.expectedSettlement
        ? `prevista ${formatDate(payment.expectedSettlement)}`
        : null,
  ];
  return (
    <ol className={clsx('grid grid-cols-3', compact ? 'gap-1' : 'gap-2')}>
      {STEPS.map((label, i) => {
        const done = i <= reached;
        return (
          <li key={label} className="relative">
            {i > 0 && (
              <span
                className={clsx(
                  'absolute top-[11px] right-1/2 left-[-50%] h-[3px] rounded-full',
                  done ? 'bg-paid' : 'bg-rule',
                )}
                aria-hidden
              />
            )}
            <div className="relative flex flex-col items-center gap-1.5 text-center">
              <span
                className={clsx(
                  'grid size-6 place-items-center rounded-full border-[3px]',
                  done ? 'border-paid bg-paid text-on-paid' : 'border-rule bg-sheet',
                  i === reached && payment.status !== 'settled' && 'ring-4 ring-paid/20',
                )}
              >
                {done && <Check className="size-3.5" strokeWidth={3.5} aria-hidden />}
              </span>
              <span className={clsx('text-[0.84rem] font-[620]', done ? 'text-ink' : 'text-ink-3')}>
                {label}
              </span>
              {!compact && dates[i] && (
                <span className="text-[0.78rem] leading-tight text-ink-3">{dates[i]}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The transfer on a receipt: when, how, to where, and its reference. */
export function PaymentPanel({ payment }: { payment: PaymentView }) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-h3 text-ink">La transferencia</h2>
        <span className="font-display rounded-full bg-noche px-3 py-1 text-[0.84rem] font-[650] text-marker">
          {payment.railName}
        </span>
      </div>
      <PaymentTimeline payment={payment} />
      <p className="text-[0.95rem] leading-relaxed text-ink-2">
        {formatMoney(payment.amountMinor, payment.currency)} a {payment.payeeName}, a su destino
        registrado {maskDestination(payment.destination)}.{' '}
        {payment.status === 'scheduled'
          ? `Sale el ${formatDate(payment.scheduledFor)}: el día que vence, no antes.`
          : payment.reference
            ? `Referencia ${payment.reference}.`
            : ''}
      </p>
    </div>
  );
}
