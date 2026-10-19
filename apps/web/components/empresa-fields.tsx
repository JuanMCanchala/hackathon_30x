'use client';

/**
 * The small editors of «Mi empresa»: a labelled input, removable chips with an inline «+ Agregar»,
 * and the list of reference accounts. They edit a draft; the page saves it.
 */
import clsx from 'clsx';
import { Plus, X } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';

/** A label over a white input, as in the mockup. */
export function TextField({
  label,
  className,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={clsx('grid min-w-0 gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.88rem] font-[600] text-ink">
        {label}
      </label>
      <input
        id={id}
        className="h-11 w-full min-w-0 rounded-[10px] border border-rule bg-sheet px-3.5 text-[0.95rem] font-[600] text-ink outline-none placeholder:font-[400] placeholder:text-ink-3 focus:border-brand focus:ring-4 focus:ring-brand/15"
        {...rest}
      />
    </div>
  );
}

/** The inline «+ Agregar» that becomes an input; Enter adds, Escape cancels. */
export function AddInline({
  label = 'Agregar',
  placeholder,
  onAdd,
  className,
}: {
  label?: string;
  placeholder?: string;
  onAdd: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const commit = () => {
    const v = value.trim();
    if (v) onAdd(v);
    setValue('');
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setValue('');
      setOpen(false);
    }
  };
  if (open)
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={placeholder ?? label}
        aria-label={label}
        className={clsx(
          'h-8 w-40 min-w-0 rounded-[8px] border border-brand bg-sheet px-2.5 text-[0.88rem] text-ink outline-none ring-4 ring-brand/15',
          className,
        )}
      />
    );
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={clsx(
        'inline-flex h-8 items-center gap-1 rounded-[8px] border border-dashed border-rule-strong px-2.5 text-[0.88rem] text-ink-2 transition hover:border-ink-3 hover:text-ink max-lg:relative max-lg:after:absolute max-lg:after:inset-x-0 max-lg:after:-inset-y-1',
        className,
      )}
    >
      <Plus className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

/** Removable chips plus «+ Agregar»; duplicates are ignored. */
export function ChipList({
  items,
  onChange,
  addLabel = 'Agregar',
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  addLabel?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[8px] border border-rule bg-sheet pr-1.5 pl-3 text-[0.9rem] text-ink"
        >
          <span className="truncate">{item}</span>
          <button
            type="button"
            onClick={() => onChange(items.filter((i) => i !== item))}
            className="relative grid size-5 place-items-center rounded-full text-ink-3 transition after:absolute after:-inset-2.5 hover:bg-fill hover:text-ink"
            aria-label={`Quitar ${item}`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <AddInline
        label={addLabel}
        placeholder={placeholder}
        onAdd={(v) => {
          if (!items.some((i) => i.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
        }}
      />
    </div>
  );
}

/** A small heading over a chip list inside a card. */
export function SubLabel({ children }: { children: string }) {
  return <p className="mb-2 text-[0.88rem] font-[600] text-ink">{children}</p>;
}
