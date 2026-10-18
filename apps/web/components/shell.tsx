'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import clsx from 'clsx';
import {
  CalendarDays,
  ListChecks,
  Menu,
  Monitor,
  Moon,
  RadioTower,
  Radar,
  Sun,
  Users,
  Waves,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AskPanel, AskTrigger } from './ask-panel';
import { Logo } from './brand';

const NAV = [
  { href: '/radar', label: 'Radar', icon: Waves },
  { href: '/vigia', label: 'Vigía', icon: Radar },
  { href: '/referentes', label: 'Referentes', icon: Users },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/sensor', label: 'Sensor', icon: RadioTower },
  { href: '/evaluacion', label: 'Evaluación', icon: ListChecks },
] as const;

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

const THEME_KEY = 'radar:theme';
let chosenTheme: Theme | null = null;
const themeListeners = new Set<() => void>();

function readTheme(): Theme {
  if (chosenTheme) return chosenTheme;
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

function chooseTheme(next: Theme) {
  chosenTheme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // storage unavailable: the choice lasts for this page
  }
  applyTheme(next);
  themeListeners.forEach((listener) => listener());
}

function ThemeSwitch() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as Theme);
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Como el sistema', icon: Monitor },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex w-fit rounded-full bg-fill p-0.5"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => chooseTheme(value)}
          className={clsx(
            'rounded-full px-2.5 py-1 text-ink-3 transition hover:text-ink',
            theme === value && 'bg-sheet text-ink shadow-sheet',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

const isActive = (pathname: string, href: string) =>
  href === '/radar'
    ? pathname.startsWith('/radar') || pathname.startsWith('/tema')
    : pathname.startsWith(href);

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(pathname, href) ? 'page' : undefined}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[0.95rem] transition',
            isActive(pathname, href) ? 'bg-ink font-[700] text-sheet' : 'text-ink hover:bg-fill',
          )}
        >
          <Icon className="size-4 lg:hidden" aria-hidden />
          {label}
        </Link>
      ))}
    </>
  );
}

/**
 * The app frame: OndAI's floating pill on top (logo, sections, the question box), as on the
 * landing, and the page below.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAskOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="material mx-auto flex h-[60px] max-w-[1376px] items-center gap-3 rounded-full border border-rule pr-2.5 pl-5">
          <Link
            href="/radar"
            className="shrink-0 text-ink"
            aria-label="OndAI, el radar de la semana"
          >
            <Logo />
          </Link>
          <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Secciones">
            <NavLinks pathname={pathname} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <AskTrigger onOpen={() => setAskOpen(true)} />
            <div className="hidden xl:block">
              <ThemeSwitch />
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid size-10 place-items-center rounded-full text-ink hover:bg-fill lg:hidden"
              aria-label="Abrir secciones"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 bg-sheet flex w-[86vw] max-w-xs flex-col gap-5 overflow-y-auto px-4 py-5 outline-none lg:hidden">
            <DialogPrimitive.Title className="sr-only">Secciones</DialogPrimitive.Title>
            <div className="flex items-center justify-between">
              <Logo className="text-ink" />
              <DialogPrimitive.Close
                className="grid size-9 place-items-center rounded-full bg-fill text-ink"
                aria-label="Cerrar"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <nav className="grid gap-1" aria-label="Secciones">
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
            <ThemeSwitch />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AskPanel open={askOpen} onOpenChange={setAskOpen} />
    </div>
  );
}

/** The page column below the top bar. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10', className)}>
      {children}
    </div>
  );
}
