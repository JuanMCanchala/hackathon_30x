/**
 * OndAI's app kit, from the demo mockup: breadcrumbed page heads, white cards with a tinted icon
 * tile, KPI tiles, filter pills, stage and moment chips, and table styles. Every screen builds
 * from these so the app reads as one piece.
 */
import clsx from 'clsx';
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { STAGE_COPY, type Lang, type LanguageWave, type Stage } from '@/lib/types';

// ------------------------------------------------------------------ page head

export interface Crumb {
  label: string;
  href?: string;
}

/** «Descubrir › Vigía», the title and one line under it, with actions on the right. */
export function PageHead({
  crumbs,
  title,
  lead,
  actions,
  className,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={clsx('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 max-w-3xl">
        {crumbs && crumbs.length > 0 && (
          <nav
            aria-label="Ruta"
            className="mb-2 flex flex-wrap items-center gap-1.5 text-[0.84rem]"
          >
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 && (
                  <span className="text-ink-3" aria-hidden>
                    ›
                  </span>
                )}
                {c.href ? (
                  <Link href={c.href} className="text-brand hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-ink-2">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-[1.625rem] leading-tight font-[700] tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {lead && <p className="mt-1.5 text-[0.95rem] text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ------------------------------------------------------------------ cards

export type Tone = 'orange' | 'lavender' | 'green' | 'sand' | 'amber' | 'dark';

const TILE: Record<Tone, string> = {
  orange: 'bg-[#ffe9dd] text-marker-strong',
  lavender: 'bg-lavender-tint text-brand-strong',
  green: 'bg-st-emergente-tint text-st-emergente',
  sand: 'bg-fill text-ink',
  amber: 'bg-st-saturado-tint text-st-saturado',
  dark: 'bg-ink text-sheet',
};

/** The small tinted square that holds a card's icon. */
export function IconTile({
  tone = 'sand',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'grid size-8 shrink-0 place-items-center rounded-[8px] [&_svg]:size-[1.05rem]',
        TILE[tone],
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** A white card with a hairline border; an optional head with icon, title and action. */
export function Card({
  icon,
  tone,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  icon?: ReactNode;
  tone?: Tone;
  title?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('rounded-[14px] border border-rule bg-sheet p-5', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <IconTile tone={tone}>{icon}</IconTile>}
            {title && <h2 className="truncate text-[1rem] font-[700] text-ink">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A KPI tile: label and icon on top, the figure, a note below. */
export function Kpi({
  label,
  value,
  note,
  icon,
  tone = 'sand',
  noteTone = 'muted',
  href,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  noteTone?: 'muted' | 'good';
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.88rem] text-ink-2">{label}</span>
        {icon && <IconTile tone={tone}>{icon}</IconTile>}
      </div>
      <p className="mt-2 text-[1.6rem] leading-none font-[700] tracking-[-0.02em] text-ink tabular-nums">
        {value}
      </p>
      {note && (
        <p
          className={clsx(
            'mt-2.5 text-[0.8rem]',
            noteTone === 'good' ? 'text-st-emergente' : 'text-ink-2',
          )}
        >
          {note}
        </p>
      )}
    </>
  );
  const cls = 'block rounded-[14px] border border-rule bg-sheet px-5 py-4';
  return href ? (
    <Link href={href} className={clsx(cls, 'transition hover:border-rule-strong')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// ------------------------------------------------------------------ pills and chips

/** A filter pill: outlined, dark when on. */
export function Pill({
  on,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-[9px] border px-3 text-[0.88rem] whitespace-nowrap transition',
        on
          ? 'border-ink bg-ink font-[600] text-sheet'
          : 'border-rule bg-sheet text-ink hover:border-rule-strong',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

const STAGE_CHIP: Record<Stage, string> = {
  emergente: 'bg-st-emergente-tint text-st-emergente',
  crecimiento: 'bg-st-crecimiento-tint text-st-crecimiento',
  saturado: 'bg-st-saturado-tint text-st-saturado',
  declive: 'bg-st-declive-tint text-st-declive',
  estable: 'bg-fill text-ink-2',
};

/** «EMERGENTE»: the stage, in capitals on its tint. */
export function StageChip({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-[6px] px-2 py-[3px] text-[0.72rem] font-[700] tracking-[0.02em] whitespace-nowrap uppercase',
        STAGE_CHIP[stage],
        className,
      )}
    >
      {STAGE_COPY[stage]}
    </span>
  );
}

/** The recommended moment: «Entra ya» in solid orange, the rest outlined. */
export function MomentChip({ timing, className }: { timing: string; className?: string }) {
  const now = timing === 'Entra ya';
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-[6px] px-2 py-[3px] text-[0.75rem] font-[700] whitespace-nowrap',
        now ? 'bg-marker text-on-marker' : 'border border-rule-strong text-ink',
        className,
      )}
    >
      {timing}
    </span>
  );
}

const LANG_ON: Record<Lang, string> = {
  en: 'bg-[#e6e1ff] text-[#3b33a8]',
  pt: 'bg-st-emergente-tint text-st-emergente',
  es: 'bg-[#ffe9dd] text-marker-strong',
};

/**
 * EN · PT · ES as three small boxes: filled where the topic is growing in that language, outlined
 * where it is not there yet.
 */
export function LangBoxes({
  languages,
  className,
}: {
  languages: Record<Lang, LanguageWave>;
  className?: string;
}) {
  return (
    <span className={clsx('inline-flex gap-1', className)}>
      {(['en', 'pt', 'es'] as const).map((l) => {
        const w = languages[l];
        const on = w.creators > 0 && w.stage !== 'ausente';
        return (
          <span
            key={l}
            title={`${l.toUpperCase()}: ${w.creators} creadores esta semana`}
            className={clsx(
              'grid h-[22px] min-w-[30px] place-items-center rounded-[5px] px-1 text-[0.7rem] font-[700]',
              on ? LANG_ON[l] : 'border border-rule text-ink-3',
            )}
          >
            {l.toUpperCase()}
          </span>
        );
      })}
    </span>
  );
}

/** Small mono label above a block: «ÁNGULO · VARIANTE 1». */
export function MonoLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={clsx('font-mono text-[0.72rem] tracking-[0.1em] text-ink-2 uppercase', className)}
    >
      {children}
    </p>
  );
}

// ------------------------------------------------------------------ tables

/** Table styles: a sand header row and hairline rows. Use on <table>, <th> and <td>. */
export const table = {
  wrap: 'w-full overflow-x-auto',
  table: 'w-full border-separate border-spacing-0 text-left text-[0.93rem]',
  th: 'bg-sheet-2 px-3 py-2.5 text-[0.75rem] font-[600] text-ink-3 first:rounded-l-[8px] last:rounded-r-[8px]',
  td: 'border-b border-rule px-3 py-3.5 align-middle text-ink',
};

/** The dark note at the foot of a screen: «Nada se publica solo». */
export function DarkNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-[14px] bg-ink px-5 py-4 text-[0.92rem] text-sheet',
        className,
      )}
    >
      {children}
    </div>
  );
}
