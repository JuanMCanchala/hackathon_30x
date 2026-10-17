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
          className="inline-flex flex-wrap rounded-lg border border-rule bg-sheet p-0.5"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={clsx(
                'rounded-md px-3 py-1.5 text-sm',
                status === f.value
                  ? 'bg-brand-tint font-[620] text-ink'
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
          className="h-10 rounded-lg border border-rule-strong bg-sheet px-3 text-sm text-ink"
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
        <div className="sheet overflow-hidden">
          <InvoiceRows items={data} />
        </div>
      ) : (
        <Empty title="No hay facturas con estos filtros">
          Sube una factura con el botón de arriba o procesa un mes en el recorrido guiado.
        </Empty>
      )}
    </div>
  );
}
