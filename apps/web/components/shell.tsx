'use client';

import clsx from 'clsx';
import {
  Landmark,
  Menu,
  MessagesSquare,
  PanelsTopLeft,
  ReceiptText,
  Route,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useOverview } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { Phase } from '@/lib/types';
import { Logo } from './brand';
import { ThemeSwitch } from './theme';

const NAV = [
  { href: '/resumen', label: 'Resumen', icon: PanelsTopLeft },
  { href: '/cuentas', label: 'Cuentas', icon: ReceiptText },
  { href: '/proveedores', label: 'Proveedores', icon: Users },
  { href: '/conversaciones', label: 'Conversaciones', icon: MessagesSquare },
  { href: '/conciliacion', label: 'Conciliación', icon: Landmark },
  { href: '/recorrido', label: 'Recorrido', icon: Route },
];

const PHASE: Record<Phase, string> = {
  idle: 'Demo sin iniciar',
  september: 'Septiembre cerrado',
  arriving: 'Llegan las cuentas de octubre',
  october: 'Octubre en curso',
  closed: 'Octubre cerrado',
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'flex h-10 items-center gap-3 rounded-[6px] px-3 text-[0.9375rem] font-[650] transition-colors duration-150',
              active ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-fill hover:text-ink',
            )}
          >
            <Icon className="size-[1.125rem]" aria-hidden strokeWidth={2} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The demo's simulated clock, read from the overview. */
function DemoClock() {
  const { data, error } = useOverview();
  const now = data?.clock.now;
  return (
    <div className="grid gap-1 border-t border-rule pt-4">
      <span className="text-[0.75rem] font-[650] text-ink-3">Hoy en la demo</span>
      <span className="t-mono text-[0.9375rem] text-ink">
        {now ? formatDateTime(now) : error ? 'API sin conexión' : '…'}
      </span>
      {data && <span className="text-[0.8125rem] text-ink-2">{PHASE[data.clock.phase]}</span>}
    </div>
  );
}

function User() {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-ink text-[0.8125rem] font-[800] text-paper"
      >
        PH
      </span>
      <span className="leading-tight">
        <span className="block text-[0.9375rem] font-[700] text-ink">Paula Herrera</span>
        <span className="block text-[0.8125rem] text-ink-3">Finanzas · Altamar Labs</span>
      </span>
    </div>
  );
}

function RailFooter() {
  return (
    <div className="grid gap-5">
      <DemoClock />
      <User />
      <ThemeSwitch className="w-fit" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // the phone menu closes on navigation (NavLinks) and on Escape; while open it holds the focus
  // and the page behind it does not scroll
  useEffect(() => {
    if (!open) return;
    const button = toggle.current;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      button?.focus();
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[6px] focus:bg-sheet focus:px-3 focus:py-2"
      >
        Saltar al contenido
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-rule bg-sheet px-4 py-6 lg:flex">
        <div className="grid gap-8">
          <Link href="/" className="w-fit px-2" aria-label="Recibido, inicio">
            <Logo />
          </Link>
          <NavLinks />
        </div>
        <div className="px-2">
          <RailFooter />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-sheet px-4 lg:hidden">
        <Link href="/" aria-label="Recibido, inicio">
          <Logo />
        </Link>
        <button
          ref={toggle}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-movil"
          className="grid size-10 place-items-center rounded-[6px] text-ink hover:bg-fill"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
        </button>
      </header>
      {open && (
        <div
          ref={panel}
          id="menu-movil"
          className="rise-in fixed inset-x-0 top-14 bottom-0 z-20 grid content-between gap-8 overflow-y-auto border-t border-rule bg-sheet px-4 py-5 lg:hidden"
        >
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="px-2 pb-4">
            <RailFooter />
          </div>
        </div>
      )}

      <main id="contenido" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
        {/* each screen enters once on navigation (8 px rise); polls do not replay it */}
        <div
          key={pathname}
          className="rise-in mx-auto max-w-[1200px]"
          style={{ '--rise': '8px', '--dur': '280ms' } as CSSProperties}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
