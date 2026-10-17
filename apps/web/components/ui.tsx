import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';

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
