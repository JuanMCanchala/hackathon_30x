'use client';

/**
 * The editor's inspector controls: collapsible sections, segmented choices, color wells with
 * their hex, text fields that count characters and say when the type will shrink, and a switch.
 */
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type CSSProperties, type ReactNode, type Ref } from 'react';

// ------------------------------------------------------------------ section

export function Section({
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="rounded-[14px] border border-rule bg-sheet">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-[14px] px-4 py-3 text-left"
        >
          <span className="text-[0.95rem] font-[700] text-ink">{title}</span>
          {meta && <span className="min-w-0 truncate text-[0.8rem] text-ink-3">{meta}</span>}
          <ChevronDown
            className={clsx('ml-auto size-4 shrink-0 text-ink-2 transition', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h2>
      {open && (
        <div id={id} className="grid gap-4 px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** The small label above a group of controls. */
export function GroupLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[0.82rem] font-[650] text-ink-2">
      {children}
    </label>
  ) : (
    <p className="mb-1.5 text-[0.82rem] font-[650] text-ink-2">{children}</p>
  );
}

// ------------------------------------------------------------------ segmented

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; style?: CSSProperties }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div>
      <GroupLabel>{label}</GroupLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className={clsx('grid gap-0.5 rounded-[10px] bg-fill p-0.5', className)}
        style={className ? undefined : { gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              style={o.style}
              className={clsx(
                'inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[8px] px-1.5 text-[0.82rem] whitespace-nowrap transition lg:h-8',
                on
                  ? 'bg-sheet font-[650] text-ink shadow-[0_1px_2px_rgb(32_21_21/0.14)]'
                  : 'text-ink-2 hover:text-ink',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ color

/** '#f40', 'ff4f00' or '#FF4F00' → '#ff4f00'; anything else → null. */
export function normalizeHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t.toLowerCase()}`;
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${[...t.toLowerCase()].map((c) => c + c).join('')}`;
  return null;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A color well and its hex, side by side; the hex applies as soon as it is a valid color. */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-[10px] border border-rule bg-sheet p-1.5 pr-2 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        aria-label={`${label}: elegir en la paleta`}
        className="size-8 shrink-0 cursor-pointer appearance-none rounded-[7px] border border-rule bg-transparent p-0 [&::-moz-color-swatch]:rounded-[6px] [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[6px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-[0.72rem] leading-tight text-ink-2">
          {label}
        </label>
        <input
          id={id}
          value={draft ?? value.toUpperCase()}
          onChange={(e) => {
            setDraft(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onChange(hex);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setDraft(null);
          }}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={draft !== null && !normalizeHex(draft)}
          className="w-full bg-transparent font-mono text-[0.8rem] text-ink uppercase outline-none aria-invalid:text-held"
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ text

export function TextField({
  label,
  value,
  onChange,
  max,
  multiline,
  rows = 3,
  placeholder,
  note,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  /** Said under the field: why the type will shrink, what the layout shows. */
  note?: ReactNode;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const id = useId();
  const field =
    'w-full rounded-[10px] border border-transparent bg-fill px-3 text-[0.92rem] text-ink placeholder:text-ink-3 outline-none transition focus:border-brand focus:bg-sheet focus:ring-4 focus:ring-brand/15';
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[0.84rem] font-[650] text-ink">
          {label}
        </label>
        <span
          className={clsx(
            'font-mono text-[0.7rem] tabular-nums',
            value.length >= max ? 'text-held' : 'text-ink-3',
          )}
          aria-hidden
        >
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          ref={inputRef}
          id={id}
          rows={rows}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(field, 'resize-y py-2 leading-snug')}
        />
      ) : (
        <input
          id={id}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(field, 'h-10')}
        />
      )}
      {note && <p className="text-[0.78rem] leading-snug text-ink-2">{note}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ switch

export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-[10px] text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.84rem] font-[650] text-ink">{label}</span>
        {description && <span className="block text-[0.78rem] text-ink-2">{description}</span>}
      </span>
      <span
        aria-hidden
        className={clsx(
          'relative h-6 w-10 shrink-0 rounded-full transition',
          checked ? 'bg-marker' : 'bg-rule-strong',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left]',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  );
}
