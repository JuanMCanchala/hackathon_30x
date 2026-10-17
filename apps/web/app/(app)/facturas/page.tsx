'use client';

import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { formatPeriod } from '@mandato/domain';
import { InvoiceRows } from '@/components/invoice-list';
import { Empty, Input, PageHeader, Skeleton } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { InvoiceListItem, Overview } from '@/lib/types';

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pagadas', label: 'Pagadas' },
  { value: 'frenadas', label: 'Frenadas' },
  { value: 'pendientes', label: 'Por aprobar' },
  { value: 'rechazadas', label: 'Rechazadas' },
];

/** Bills by the month they belong to, newest month first; each month keeps arrival order. */
function byPeriod(items: InvoiceListItem[]): [string, InvoiceListItem[]][] {
  const groups = new Map<string, InvoiceListItem[]>();
  for (const item of items)
    groups.set(item.periodKey, [...(groups.get(item.periodKey) ?? []), item]);
  return [...groups].sort(([a], [b]) => b.localeCompare(a));
}

export default function FacturasPage() {
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('');
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (period) params.set('period', period);
  if (q.trim()) params.set('q', q.trim());
  const { data, isLoading } = useApi<InvoiceListItem[]>(`/api/v1/invoices?${params.toString()}`);
  const { data: overview } = useApi<Overview>('/api/v1/overview');

  return (
    <div>
      <PageHeader
        title="Facturas"
        lead="Todo lo que llegó por correo, WhatsApp, carga manual o un agente externo, con lo que decidió el agente y por qué."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Filtrar por estado"
          className="inline-flex flex-wrap rounded-[9px] bg-fill p-0.5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={clsx(
                'rounded-[7px] px-3 py-1 text-[0.86rem] transition',
                status === f.value
                  ? 'bg-sheet font-[590] text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
                  : 'text-ink-2 hover:text-ink',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-10 rounded-[10px] bg-fill px-3 text-sm text-ink"
          aria-label="Mes"
        >
          <option value="">Todos los meses</option>
          {overview?.periods.map((p) => (
            <option key={p.periodKey} value={p.periodKey}>
              {formatPeriod(p.periodKey)}
            </option>
          ))}
        </select>
        <div className="relative ml-auto w-full sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, emisor o MND"
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-96" />
      ) : data && data.length > 0 ? (
        <div className="grid gap-8">
          {byPeriod(data).map(([periodKey, items]) => (
            <section key={periodKey} className="grid gap-2.5" aria-label={formatPeriod(periodKey)}>
              <h2 className="font-display flex items-baseline gap-2 px-1 text-[1.1rem] font-[680] text-ink">
                <span className="inline-block first-letter:uppercase">
                  {formatPeriod(periodKey)}
                </span>
                <span className="font-sans text-sm font-[500] text-ink-3">
                  {items.length} {items.length === 1 ? 'cobro' : 'cobros'}
                </span>
              </h2>
              <div className="sheet overflow-hidden">
                <InvoiceRows items={items} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="No hay facturas con estos filtros">
          Sube una factura con el botón de arriba o procesa un mes en el recorrido guiado.
        </Empty>
      )}
    </div>
  );
}
