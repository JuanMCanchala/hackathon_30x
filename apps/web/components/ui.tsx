'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { STAGE_COPY, type Stage } from '@/lib/types';

export { clsx as cx };

// ------------------------------------------------------------------ buttons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'approve';

// Apple-style capsules: filled blue for the main action, tinted grey for the rest.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-marker text-on-marker font-[650] hover:bg-marker-strong active:translate-y-px',
  secondary: 'bg-fill text-ink hover:bg-rule-strong/60',
  ghost: 'text-brand hover:bg-fill',
  danger: 'bg-held-tint text-held hover:brightness-95',
  approve: 'bg-paid text-on-paid hover:brightness-110',
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
        'font-display inline-flex items-center justify-center gap-1.5 rounded-full font-[600] tracking-[-0.01em] transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' && 'h-8 px-3.5 text-[0.84rem]',
        size === 'md' && 'h-10 px-5 text-[0.94rem]',
        size === 'lg' && 'h-12 px-7 text-[1.0625rem]',
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

// ------------------------------------------------------------------ lifecycle stage

/** Where each stage sits on the wave, from 0 (calm sea) to 1 (gone). */
export const STAGE_X: Record<Stage, number> = {
  emergente: 0.2,
  crecimiento: 0.42,
  saturado: 0.62,
  declive: 0.84,
  estable: 0.05,
};

const STAGE_STYLE: Record<Stage, { fg: string; bg: string }> = {
  emergente: { fg: 'text-st-emergente', bg: 'bg-st-emergente-tint' },
  crecimiento: { fg: 'text-st-crecimiento', bg: 'bg-st-crecimiento-tint' },
  saturado: { fg: 'text-st-saturado', bg: 'bg-st-saturado-tint' },
  declive: { fg: 'text-st-declive', bg: 'bg-st-declive-tint' },
  estable: { fg: 'text-st-estable', bg: 'bg-fill' },
};

/** A tiny wave with a dot where the stage sits: the stage reads by shape, not only by color. */
export function StageGlyph({ stage, className }: { stage: Stage; className?: string }) {
  const x = 2 + STAGE_X[stage] * 24;
  const y = waveY(STAGE_X[stage], 12, 2.5);
  return (
    <svg viewBox="0 0 28 14" className={clsx('h-3.5 w-7 shrink-0', className)} aria-hidden>
      <path
        d={wavePath(28, 12, 2.5, 2)}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={1.6}
      />
      <circle cx={x} cy={y} r={2.6} fill="currentColor" />
    </svg>
  );
}

export function StageTag({ stage, className }: { stage: Stage; className?: string }) {
  const style = STAGE_STYLE[stage];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full py-[3px] pr-2.5 pl-1.5 text-[0.78rem] font-[620] whitespace-nowrap text-ink',
        style.bg,
        className,
      )}
    >
      <StageGlyph stage={stage} className={style.fg} />
      {STAGE_COPY[stage]}
    </span>
  );
}

/** Height of the canonical wave at x in [0, 1]: a swell that rises, breaks and recedes. */
export function waveY(x: number, height: number, top: number): number {
  const crest = 0.6;
  const shape =
    x <= crest
      ? Math.pow(Math.sin((x / crest) * (Math.PI / 2)), 1.8)
      : Math.pow(Math.cos(((x - crest) / (1 - crest)) * (Math.PI / 2)), 1.25);
  return top + (height - top) * (1 - shape);
}

/** The canonical wave as an SVG path, sampled finely so it stays smooth at any width. */
export function wavePath(width: number, height: number, top: number, padX = 0): string {
  const points: string[] = [];
  for (let i = 0; i <= 80; i++) {
    const x = i / 80;
    points.push(
      `${(padX + x * (width - 2 * padX)).toFixed(2)},${waveY(x, height, top).toFixed(2)}`,
    );
  }
  return `M${points.join(' L')}`;
}

// ------------------------------------------------------------------ numbers

const INT = new Intl.NumberFormat('es-CO');
const COMPACT = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number) => INT.format(Math.round(n));
export const fmtCompact = (n: number) => COMPACT.format(n);
/** Growth as a signed percentage: +240 %, −12 %. */
export const fmtGrowth = (pct: number) =>
  `${pct >= 0 ? '+' : '−'}${INT.format(Math.round(Math.abs(pct)))} %`;

// ------------------------------------------------------------------ form controls

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(
          'h-10 w-full rounded-[10px] border border-transparent bg-fill px-3 text-[0.95rem] text-ink placeholder:text-ink-3 tabular-nums outline-none focus:border-brand focus:bg-sheet focus:ring-4 focus:ring-brand/15',
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
        'w-full rounded-[12px] border border-transparent bg-fill px-3 py-2.5 text-[0.95rem] text-ink placeholder:text-ink-3 outline-none focus:border-brand focus:bg-sheet focus:ring-4 focus:ring-brand/15',
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
      <label htmlFor={htmlFor} className="text-[0.84rem] font-[560] text-ink-2">
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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="t-h1 text-ink">{title}</h1>
        {lead && <p className="mt-2.5 text-[1.0625rem] leading-relaxed text-ink-2">{lead}</p>}
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
  return <div className={clsx('animate-pulse rounded-[18px] bg-sheet', className)} aria-hidden />;
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[6px]" />
        <DialogPrimitive.Content
          className={clsx(
            'fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[22px] bg-sheet p-6 shadow-float',
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
            {/* The circle stays small; the tap area around it is 40 px. */}
            <DialogPrimitive.Close
              className="relative grid size-7 shrink-0 place-items-center rounded-full bg-fill text-ink-2 after:absolute after:-inset-1.5 hover:text-ink"
              aria-label="Cerrar"
            >
              <X className="size-4" strokeWidth={2.5} />
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
          className="material z-50 max-w-xs rounded-[12px] px-3 py-2 text-sm text-ink shadow-float"
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
