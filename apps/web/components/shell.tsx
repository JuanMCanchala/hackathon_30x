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
import { useSession } from '@/lib/session';
import type { Overview } from '@/lib/types';
import { Logo } from './guilloche';
import { Button } from './ui';
import { UploadDialog } from './upload-dialog';

const NAV = [
  { href: '/', label: 'Resumen', icon: Gauge },
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
      className="inline-flex rounded-lg border border-rule bg-sheet p-0.5"
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
            'rounded-md p-1.5 text-ink-3 hover:text-ink',
            theme === value && 'bg-brand-tint text-ink',
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
      <DropdownMenu.Trigger className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sheet-2">
        <span className="grid size-8 place-items-center rounded-full bg-brand-tint text-sm font-[700] text-brand-strong">
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
          className="z-50 w-72 rounded-xl border border-rule bg-sheet p-1.5 shadow-sheet"
        >
          <DropdownMenu.Label className="px-2.5 py-2 text-xs text-ink-3">
            Demo: actúa como otra persona del equipo
          </DropdownMenu.Label>
          {session?.users.map((u) => (
            <DropdownMenu.Item
              key={u.id}
              onSelect={() => switchUser(u.id)}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-sheet-2',
                u.id === user?.id && 'bg-brand-tint/60',
              )}
            >
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-brand-tint text-xs font-[700] text-brand-strong">
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
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        const count = badge ? badges[badge] : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] transition-colors',
              active
                ? 'bg-sheet font-[620] text-ink shadow-[inset_3px_0_0_var(--brand)]'
                : 'text-ink-2 hover:bg-sheet/70 hover:text-ink',
            )}
          >
            <Icon
              className={clsx(
                'size-[1.15rem]',
                active ? 'text-brand' : 'text-ink-3 group-hover:text-ink-2',
              )}
              aria-hidden
            />
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span className="min-w-6 rounded-full bg-pending-tint px-1.5 text-center text-xs font-[700] text-ink">
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
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule px-4 py-5 lg:flex">
        <Link href="/" className="px-2" aria-label="Mandato, inicio">
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto grid gap-3 px-2 text-xs text-ink-3">
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
                ? `Claude en vivo (${session.reader.model})`
                : 'lecturas grabadas de Claude'}
          </p>
          <ThemeSwitch />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-paper/90 px-4 py-3 backdrop-blur sm:px-8">
          <button
            type="button"
            className="rounded-md p-1.5 text-ink-2 hover:bg-sheet lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <Link href="/" className="lg:hidden" aria-label="Mandato, inicio">
            <Logo />
          </Link>
          <p className="hidden text-sm text-ink-2 lg:block">
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
            className="fixed inset-0 z-40 bg-ink/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="h-full w-[86vw] max-w-xs overflow-y-auto bg-paper px-4 py-5"
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

        <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-8 lg:py-10">{children}</main>
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
