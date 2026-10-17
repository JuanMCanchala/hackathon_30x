'use client';

import clsx from 'clsx';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'recibido:theme'; // keep in sync with the pre-paint script in app/layout.tsx

let chosen: Theme | null = null;
const listeners = new Set<() => void>();

function read(): Theme {
  if (chosen) return chosen;
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function choose(next: Theme) {
  chosen = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage unavailable: the choice lasts for this page
  }
  const dark =
    next === 'dark' || (next === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  listeners.forEach((l) => l());
}

const OPTIONS = [
  { value: 'light', label: 'Tema claro', icon: Sun },
  { value: 'dark', label: 'Tema oscuro', icon: Moon },
  { value: 'system', label: 'Tema del sistema', icon: Monitor },
] as const;

export function ThemeSwitch({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => 'system' as Theme);
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={clsx('inline-flex rounded-[6px] border border-rule p-0.5', className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={clsx(
            'grid size-7 place-items-center rounded-[4px] transition-colors duration-150',
            theme === value ? 'bg-ink text-paper' : 'text-ink-3 hover:text-ink',
          )}
        >
          <Icon className="size-3.5" aria-hidden strokeWidth={2.25} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
