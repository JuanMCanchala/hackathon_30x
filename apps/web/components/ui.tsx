import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-stamp text-on-stamp hover:bg-stamp-strong',
  secondary: 'border border-rule-strong bg-sheet text-ink hover:border-ink',
  ghost: 'text-ink-2 hover:bg-fill hover:text-ink',
};
const SIZE = { md: 'h-11 px-5 text-[0.9375rem]', sm: 'h-9 px-3 text-sm' } as const;

export function buttonClass(variant: Variant = 'primary', size: keyof typeof SIZE = 'md') {
  return clsx('btn', VARIANT[variant], SIZE[size]);
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <button type={type} className={clsx(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZE }) {
  return <Link className={clsx(buttonClass(variant, size), className)} {...props} />;
}

/** The heading of an app page: title, one line of context, optional actions on the right. */
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
    <header className="flex flex-wrap items-end justify-between gap-4 pb-8">
      <div className="max-w-[60ch]">
        <h1 className="t-h1">{title}</h1>
        {lead && <p className="mt-2 text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Amounts, hours and references are set in the mono face with tabular figures. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('t-mono', className)}>{children}</span>;
}

/**
 * A file picker in Spanish (the native input's button follows the browser's language). The input
 * stays in the tab order, visually hidden; the label shows the focus ring.
 */
export function FileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="grid gap-1.5 text-[0.875rem] font-[650]">
      <span>{label}</span>
      <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-[6px] border border-dashed border-rule-strong bg-paper px-3 py-3 font-[450] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-stamp hover:border-ink">
        <input
          type="file"
          accept=".pdf,.eml,.txt,application/pdf,message/rfc822,text/plain"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <span className="rounded-[6px] bg-ink px-3 py-1.5 font-[650] text-paper">
          Elegir archivo
        </span>
        <span className={clsx('min-w-0 truncate', file ? 'text-ink' : 'text-ink-3')}>
          {file ? file.name : 'Ningún archivo elegido'}
        </span>
      </label>
    </div>
  );
}

/** `--delay` for a staggered `.rise-in`: `step` ms apart, capped so a long list never drags. */
export const stagger = (i: number, step = 40, max = 320): CSSProperties =>
  ({ '--delay': `${Math.min(i * step, max)}ms` }) as CSSProperties;
