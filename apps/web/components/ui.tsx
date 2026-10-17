'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import { CircleCheck, CircleDashed, CircleSlash, Hand, Loader2, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { formatMoney, formatUsd } from '@mandato/domain';
import { STATUS_COPY, toneOf, type Tone } from '@/lib/outcomes';
import type { InvoiceStatus } from '@/lib/types';

export { clsx as cx };

// ------------------------------------------------------------------ buttons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'approve';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-strong',
  secondary: 'bg-sheet text-ink border border-rule-strong hover:border-ink-3 hover:bg-sheet-2',
  ghost: 'text-ink-2 hover:bg-sheet-2 hover:text-ink',
  danger: 'bg-sheet text-held border border-held/40 hover:bg-held-tint',
  approve: 'bg-paid text-white hover:brightness-110',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-[560] transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' && 'h-8 px-3 text-sm',
        size === 'md' && 'h-10 px-4 text-[0.94rem]',
        size === 'lg' && 'h-13 px-6 text-base',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ------------------------------------------------------------------ status

const TONE_STYLES: Record<Tone, { dot: string; bg: string; icon: typeof CircleCheck }> = {
  paid: { dot: 'text-paid', bg: 'bg-paid-tint', icon: CircleCheck },
  held: { dot: 'text-held', bg: 'bg-held-tint', icon: Hand },
  pending: { dot: 'text-pending', bg: 'bg-pending-tint', icon: CircleDashed },
  rejected: { dot: 'text-rejected', bg: 'bg-rejected-tint', icon: CircleSlash },
};

/** Status label: icon + words in ink, color only on the icon (never color alone). */
export function StatusTag({ status, className }: { status: InvoiceStatus; className?: string }) {
  const tone = toneOf(status);
  return <ToneTag tone={tone} label={STATUS_COPY[status]} className={className} />;
}

export function ToneTag({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  const style = TONE_STYLES[tone];
  const Icon = style.icon;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.8rem] font-[560] whitespace-nowrap text-ink',
        style.bg,
        className,
      )}
    >
      <Icon className={clsx('size-3.5', style.dot)} aria-hidden strokeWidth={2.4} />
      {label}
    </span>
  );
}

// ------------------------------------------------------------------ money

export function Money({
  minor,
  currency,
  usdCents,
  className,
  showUsd = true,
}: {
  minor: number | null | undefined;
  currency: string | null | undefined;
  usdCents?: number | null;
  className?: string;
  showUsd?: boolean;
}) {
  if (minor === null || minor === undefined || !currency)
    return <span className={clsx('text-ink-3', className)}>sin monto</span>;
  return (
    <span className={clsx('tabular-nums', className)}>
      {formatMoney(minor, currency)}
      {showUsd && currency !== 'USD' && usdCents !== null && usdCents !== undefined && (
        <span className="ml-1.5 text-ink-3">≈ {formatUsd(usdCents)}</span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ form controls

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          'h-10 w-full rounded-lg border border-rule-strong bg-sheet px-3 text-[0.95rem] text-ink placeholder:text-ink-3 tabular-nums',
          className,
        )}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        'w-full rounded-lg border border-rule-strong bg-sheet px-3 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-3',
        className,
      )}
      {...rest}
    />
  );
});

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-[600] text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-[0.82rem] text-ink-3">{hint}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ layout

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="t-h1 text-ink">{title}</h1>
        {lead && <p className="mt-2 text-[1.02rem] leading-relaxed text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sheet grid place-items-center gap-3 px-6 py-14 text-center">
      <p className="t-h3 text-ink">{title}</p>
      {children && <div className="max-w-md text-ink-2">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-md bg-rule/60', className)} aria-hidden />;
}

// ------------------------------------------------------------------ overlays

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className={clsx(
            'fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-rule bg-sheet p-6 shadow-sheet',
            wide ? 'max-w-3xl' : 'max-w-lg',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="t-h3 text-ink">{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-[0.95rem] text-ink-2">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 text-ink-3 hover:bg-sheet-2 hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Tip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-sheet"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(iso));
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(iso));
}
