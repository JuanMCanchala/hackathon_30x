'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import clsx from 'clsx';
import {
  Building2,
  CalendarDays,
  CircleHelp,
  Eye,
  Gauge,
  LayoutTemplate,
  Link2,
  LineChart,
  ListChecks,
  Menu,
  Monitor,
  Moon,
  Search,
  Star,
  Sun,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AskPanel } from './ask-panel';
import { Logo } from './brand';
import { useApi } from '@/lib/hooks';
import type { Radar } from '@/lib/types';
import { useDecisions, useProfile } from '@/lib/workspace';

/** The sections, grouped as in the demo mockup: what to look at, discover, plan, measure, set up. */
const GROUPS = [
  {
    label: null,
    items: [
      { href: '/radar', label: 'Radar', icon: Gauge },
      { href: '/elegir', label: 'Elegir', icon: ListChecks },
    ],
  },
  {
    label: 'Descubrir',
    items: [
      { href: '/vigia', label: 'Vigía', icon: Eye },
      { href: '/sensor', label: 'Sensor', icon: Link2 },
    ],
  },
  {
    label: 'Planear',
    items: [
      { href: '/calendario', label: 'Calendario', icon: CalendarDays },
      { href: '/maquetas', label: 'Maquetas', icon: LayoutTemplate },
      { href: '/referentes', label: 'Referentes', icon: Star },
    ],
  },
  { label: 'Medir', items: [{ href: '/evaluacion', label: 'Evaluación', icon: LineChart }] },
  { label: 'Configurar', items: [{ href: '/empresa', label: 'Mi empresa', icon: Building2 }] },
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
    // OndAI is a light design: light unless someone chose dark or the system's theme.
    return stored === 'dark' || stored === 'system' ? stored : 'light';
  } catch {
    return 'light';
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
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as Theme);
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Claro', icon: Sun },
    { value: 'dark', label: 'Oscuro', icon: Moon },
    { value: 'system', label: 'Como el sistema', icon: Monitor },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="inline-flex w-fit rounded-full border border-rule bg-sheet p-0.5"
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

/** The current time, refreshed every minute, so «hace 5 min» stays true while the page is open. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const ago = (iso: string, now: number) => {
  const min = Math.max(0, (now - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `hace ${Math.max(1, Math.round(min))} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

/** The workspace card, the grouped sections and the next capture at the bottom. */
function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const [profile] = useProfile();
  const [decisions] = useDecisions();
  const { data: radar } = useApi<Radar>('/api/v1/radar');
  const now = useNow();
  const pending = radar ? radar.topics.filter((t) => !decisions[t.id]).length : 0;
  // The capture runs every two hours; the next one is two hours after the last.
  const next = radar?.basis.updatedAt
    ? Math.round((new Date(radar.basis.updatedAt).getTime() + 2 * 3_600_000 - now) / 60_000)
    : null;
  return (
    <div className="flex h-full flex-col gap-1">
      <Link
        href="/empresa"
        onClick={onNavigate}
        className="mb-3 flex items-center gap-3 rounded-[12px] border border-rule bg-panel px-3 py-2.5 hover:border-rule-strong"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-ink text-[0.72rem] font-[800] text-sheet">
          {profile.name.slice(0, 3).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[0.92rem] font-[700] text-ink">
            Equipo {profile.name}
          </span>
          <span className="block truncate text-[0.76rem] text-ink-2">Tema: {profile.topic}</span>
        </span>
      </Link>
      <nav className="grid gap-0.5" aria-label="Secciones">
        {GROUPS.map((g) => (
          <div key={g.label ?? 'main'} className="grid gap-0.5">
            {g.label && (
              <p className="mt-4 mb-1 px-2.5 text-[0.75rem] font-[600] text-ink-3">{g.label}</p>
            )}
            {g.items.map(({ href, label, icon: Icon }) => {
              const on = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[0.9rem] transition',
                    on
                      ? 'bg-sheet font-[600] text-ink shadow-[0_1px_2px_rgb(32_21_21/0.06)]'
                      : 'text-ink hover:bg-sheet/60',
                  )}
                >
                  <Icon
                    className={clsx('size-[1.05rem]', on ? 'text-marker' : 'text-ink-2')}
                    aria-hidden
                  />
                  <span className="flex-1">{label}</span>
                  {href === '/elegir' && pending > 0 && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-marker px-1 text-[0.68rem] font-[700] text-on-marker">
                      {pending}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {radar && (
        <div className="mt-auto rounded-[12px] border border-[#fbd9c6] bg-[#fff4ee] px-3.5 py-3 dark:border-panel-rule dark:bg-panel">
          <p className="text-[0.86rem] font-[700] text-ink">
            {next !== null && next > 0
              ? `Próxima búsqueda en ${next} min`
              : `Última captura ${radar.basis.updatedAt ? ago(radar.basis.updatedAt, now) : 'sin fecha'}`}
          </p>
          <p className="mt-1 text-[0.76rem] leading-snug text-ink-2">
            {radar.basis.sources} fuentes · cada 2 horas · costo de la semana USD{' '}
            {radar.cost.weekUsd.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The app frame of the demo mockup: a top bar (logo, the search that asks OndAI, freshness and
 * help), the grouped sections on the left and the screen in a rounded warm-white panel.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [askOpen, setAskOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: radar } = useApi<Radar>('/api/v1/radar');
  const now = useNow();

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
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 bg-paper px-3 sm:px-5">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid size-10 place-items-center rounded-full text-ink hover:bg-sheet lg:hidden"
          aria-label="Abrir secciones"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/radar" className="shrink-0 text-ink lg:w-[216px]" aria-label="OndAI, el radar">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setAskOpen(true)}
          className="ml-auto flex h-10 min-w-0 items-center gap-2.5 rounded-[10px] border border-rule bg-sheet px-3 text-left text-[0.9rem] text-ink-2 transition hover:border-rule-strong sm:w-[420px] lg:ml-0"
        >
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden flex-1 truncate sm:block">
            Busca un tema o pregúntale a OndAI
          </span>
          <kbd className="hidden rounded-[5px] border border-rule px-1.5 font-mono text-[0.7rem] text-ink-3 sm:block">
            ⌘K
          </kbd>
        </button>
        <div className="ml-auto hidden items-center gap-3 lg:flex">
          {radar?.basis.updatedAt && (
            <span className="flex items-center gap-2 text-[0.86rem] text-ink-2">
              <span className="size-2 rounded-full bg-st-emergente" aria-hidden />
              Actualizado {ago(radar.basis.updatedAt, now)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="flex h-10 items-center gap-2 rounded-[10px] border border-rule bg-sheet px-3 text-[0.9rem] font-[600] text-ink hover:border-rule-strong"
          >
            <CircleHelp className="size-4" aria-hidden />
            Ayuda
          </button>
          <ThemeSwitch />
        </div>
      </header>

      <div className="flex gap-3 px-3 pb-3 sm:px-5 sm:pb-5 lg:pl-3">
        <aside className="sticky top-[60px] hidden h-[calc(100dvh-80px)] w-[224px] shrink-0 overflow-y-auto lg:block">
          <Sidebar pathname={pathname} />
        </aside>
        <main className="min-w-0 flex-1 rounded-[22px] border border-panel-rule bg-panel px-4 pt-6 pb-12 sm:px-9 sm:pt-7 sm:pb-14">
          {children}
        </main>
      </div>

      <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[280px] flex-col gap-4 overflow-y-auto bg-paper px-3 py-4 outline-none lg:hidden">
            <DialogPrimitive.Title className="sr-only">Secciones</DialogPrimitive.Title>
            <div className="flex items-center justify-between px-1">
              <Logo className="text-ink" />
              <DialogPrimitive.Close
                className="grid size-9 place-items-center rounded-full bg-sheet text-ink"
                aria-label="Cerrar"
              >
                <X className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1">
              <Sidebar pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
            <ThemeSwitch />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AskPanel open={askOpen} onOpenChange={setAskOpen} />
    </div>
  );
}

/** A screen's column inside the panel. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('mx-auto w-full max-w-[1180px]', className)}>{children}</div>;
}
