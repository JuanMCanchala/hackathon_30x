'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import {
  BookOpenCheck,
  Bot,
  ChevronDown,
  FileStack,
  Gauge,
  Handshake,
  Menu,
  Monitor,
  Moon,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  Stamp,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useApi } from '@/lib/hooks';
import { useLive } from '@/lib/live';
import { modelName } from '@/lib/reader';
import { useSession } from '@/lib/session';
import type { Overview } from '@/lib/types';
import { Logo } from './brand';
import { Button } from './ui';
import { UploadDialog } from './upload-dialog';

const NAV = [
  { href: '/resumen', label: 'Resumen', icon: Gauge },
  { href: '/facturas', label: 'Facturas', icon: FileStack },
  { href: '/aprobaciones', label: 'Por aprobar', icon: Stamp, badge: 'approvals' as const },
  { href: '/acuerdos', label: 'Acuerdos', icon: Handshake, badge: 'proposals' as const },
  { href: '/reglas', label: 'Reglas', icon: SlidersHorizontal },
  { href: '/auditoria', label: 'Auditoría', icon: BookOpenCheck },
  { href: '/ataques', label: 'Ataca al agente', icon: ShieldAlert },
  { href: '/agentes', label: 'Agentes conectados', icon: Bot },
  { href: '/recorrido', label: 'Recorrido guiado', icon: ScrollText },
];

type Theme = 'system' | 'light' | 'dark';

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

const THEME_KEY = 'mandato:theme';
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
      className="inline-flex w-fit rounded-full bg-white/10 p-0.5"
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
            'rounded-full px-2.5 py-1 text-white/60 transition hover:text-white',
            theme === value && 'bg-marker text-on-marker hover:text-on-marker',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

function UserSwitch() {
  const { session, switchUser } = useSession();
  const user = session?.user;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-left hover:bg-fill">
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-b from-[#a8a8ad] to-[#86868b] text-[0.8rem] font-[600] text-white">
          {user?.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('') ?? '…'}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-[600] text-ink">{user?.name ?? 'Cargando'}</span>
          <span className="block text-xs text-ink-3">{user?.title}</span>
        </span>
        <ChevronDown className="size-4 text-ink-3" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="material z-50 w-72 rounded-[14px] p-1.5 shadow-float"
        >
          <DropdownMenu.Label className="px-2.5 py-2 text-xs text-ink-3">
            Demo: actúa como otra persona del equipo
          </DropdownMenu.Label>
          {session?.users.map((u) => (
            <DropdownMenu.Item
              key={u.id}
              onSelect={() => switchUser(u.id)}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-[9px] px-2.5 py-2 outline-none data-[highlighted]:bg-fill',
                u.id === user?.id && 'bg-brand-tint',
              )}
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#a8a8ad] to-[#86868b] text-[0.72rem] font-[600] text-white">
                {u.name
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-[600] text-ink">{u.name}</span>
                <span className="block text-xs text-ink-3">
                  {u.title}.{' '}
                  {u.canSign
                    ? 'Aprueba pagos y firma acuerdos.'
                    : u.canApprove
                      ? 'Aprueba pagos.'
                      : 'Sube y revisa facturas.'}
                </span>
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data } = useApi<Overview>('/api/v1/overview', { refreshInterval: 30_000 });
  const badges = { approvals: data?.pendingApprovals ?? 0, proposals: data?.pendingProposals ?? 0 };
  return (
    <nav aria-label="Secciones" className="grid gap-0.5">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = pathname.startsWith(href);
        const count = badge ? badges[badge] : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'group font-display flex items-center gap-2.5 rounded-full px-3 py-2 text-[0.98rem] transition-colors',
              active
                ? 'bg-marker font-[650] text-on-marker'
                : 'font-[500] text-white/75 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon
              className={clsx(
                'size-[1.1rem]',
                active ? 'text-on-marker' : 'text-white/55 group-hover:text-marker',
              )}
              aria-hidden
            />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span
                className={clsx(
                  'min-w-6 rounded-full px-1.5 text-center text-[0.75rem] font-[600] tabular-nums',
                  active ? 'bg-noche/15 text-on-marker' : 'bg-white/10 text-white/80',
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { connected } = useLive();
  const { session } = useSession();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="noche sticky top-0 hidden h-dvh flex-col gap-7 px-3 py-6 lg:flex">
        <Link href="/" className="px-2.5 text-white" aria-label="Mandato, página de inicio">
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto grid gap-3 px-2.5 text-[0.78rem] leading-snug text-white/55">
          <p className="flex items-center gap-2">
            <span
              className={clsx('size-2 rounded-full', connected ? 'bg-paid' : 'bg-rule-strong')}
              aria-hidden
            />
            {connected ? 'Conectado en tiempo real' : 'Reconectando…'}
          </p>
          <p>
            Lector:{' '}
            {session?.reader.name === 'ground-truth'
              ? 'de referencia, sin IA (desarrollo)'
              : session?.reader.live
                ? `${modelName(session.reader.model)} en vivo y lecturas grabadas`
                : 'lecturas grabadas'}
          </p>
          <ThemeSwitch />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="material sticky top-0 z-30 flex items-center gap-3 border-b border-rule/70 px-4 py-2.5 sm:px-8">
          <button
            type="button"
            className="rounded-full p-1.5 text-brand hover:bg-fill lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/resumen" className="lg:hidden" aria-label="Mandato, resumen">
            <Logo />
          </Link>
          <p className="hidden text-[0.88rem] font-[560] text-ink-2 lg:block">
            {session ? `${'Andes Labs Inc.'}, cuentas por pagar` : ''}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="primary"
              icon={<Upload className="size-4" aria-hidden />}
              onClick={() => setUploadOpen(true)}
            >
              <span className="hidden sm:inline">Subir factura</span>
              <span className="sm:hidden">Subir</span>
            </Button>
            <UserSwitch />
          </div>
        </header>

        {menuOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="noche h-full w-[86vw] max-w-xs overflow-y-auto px-3 py-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between px-2">
                <Logo />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="rounded-md p-1.5 hover:bg-sheet"
                >
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setMenuOpen(false)} />
              <div className="mt-6 px-2">
                <ThemeSwitch />
              </div>
            </div>
          </div>
        )}

        <main className="stagger mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-10 lg:py-12">
          {children}
        </main>
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
