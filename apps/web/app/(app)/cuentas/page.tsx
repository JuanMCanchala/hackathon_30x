'use client';

import { OUTCOME_LABEL } from '@recibido/domain';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { OutcomeStamp, StatusChip } from '@/components/outcome';
import { ProofBar } from '@/components/proof-bar';
import { Mono, PageHeader, stagger } from '@/components/ui';
import { UploadDialog } from '@/components/upload-dialog';
import { useBills } from '@/lib/api';
import { formatBilledAsRead, formatDate, OUTCOMES } from '@/lib/format';
import { useFresh } from '@/lib/motion';
import type { BillListItem, Outcome } from '@/lib/types';

function Row({ b, index }: { b: BillListItem; index: number }) {
  const a = b.amounts;
  return (
    // enters with a short stagger when the list first shows; a bill that arrives later enters alone
    <li className="rise-in" style={stagger(index, 30)}>
      <Link
        href={`/cuentas/${b.datasetId ?? b.id}`}
        className={clsx(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2.5 px-4 py-4 transition-colors duration-150 hover:bg-fill',
          'md:grid-cols-[minmax(0,1fr)_120px_10.5rem_12.5rem_11rem] md:px-6',
          b.status === 'SUPERSEDED' && 'opacity-60',
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-[700]">
            {b.vendorName ?? 'Proveedor sin identificar'}
          </span>
          <Mono className="text-[0.8125rem] text-ink-3">
            {b.invoiceNumber ?? 'Sin número'} · {formatDate(b.receivedAt)}
          </Mono>
        </span>
        {/* phones: the bar runs full width under the vendor and the amount */}
        <span className="order-3 col-span-2 md:order-none md:col-span-1">
          {a?.currency && a.billedMinor > 0 ? (
            <ProofBar
              size="sm"
              billedMinor={a.billedMinor}
              evidencedMinor={a.evidencedMinor}
              currency={a.currency}
            />
          ) : (
            <span className="block text-[0.75rem] text-ink-3">Sin monto</span>
          )}
        </span>
        <Mono className="text-right text-[0.9375rem]">
          {formatBilledAsRead(b.total, b.currency, a?.currency ?? null)}
        </Mono>
        <span className="order-4 col-span-2 flex flex-wrap items-center justify-between gap-2 md:order-none md:contents">
          <span className="md:justify-self-start">
            {b.outcome && <OutcomeStamp outcome={b.outcome} size="sm" />}
          </span>
          <span className="md:justify-self-end">
            <StatusChip status={b.status} />
          </span>
        </span>
      </Link>
    </li>
  );
}

export default function BillsPage() {
  const { data, error, isLoading } = useBills();
  const [filter, setFilter] = useState<Outcome | null>(null);
  const shown = data?.filter((b) => !filter || b.outcome === filter) ?? [];
  const fresh = useFresh(
    shown.map((b) => b.id),
    !!data,
  );
  const count = (o: Outcome) => data?.filter((b) => b.outcome === o).length ?? 0;

  return (
    <>
      <PageHeader
        title="Cuentas"
        lead="Cada cuenta que llegó, cuánto de lo facturado está probado y en qué va. La más reciente arriba."
        actions={<UploadDialog />}
      />
      {error && !data ? (
        <p className="sheet p-6 text-ink-2">
          No pudimos leer las cuentas: {error.message} Revisa que la API esté corriendo con{' '}
          <Mono>pnpm dev</Mono>.
        </p>
      ) : isLoading ? (
        <div className="sheet h-64" aria-busy aria-label="Cargando las cuentas" />
      ) : !data?.length ? (
        <p className="sheet p-6 text-ink-2">
          Todavía no llegó ninguna cuenta. Empieza el{' '}
          <Link href="/recorrido" className="text-ink underline">
            recorrido
          </Link>{' '}
          para que lleguen las de octubre.
        </p>
      ) : (
        <div className="grid gap-4">
          <div role="group" aria-label="Filtrar por decisión" className="flex flex-wrap gap-2">
            {[null, ...OUTCOMES].map((o) => (
              <button
                key={o ?? 'all'}
                type="button"
                aria-pressed={filter === o}
                onClick={() => setFilter(o)}
                className={clsx(
                  'btn h-9 border px-3 text-[0.875rem]',
                  filter === o
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule-strong bg-sheet text-ink-2 hover:border-ink hover:text-ink',
                )}
              >
                {o ? OUTCOME_LABEL[o] : 'Todas'}
                <span className="t-mono text-[0.8125rem] opacity-70">
                  {o ? count(o) : data.length}
                </span>
              </button>
            ))}
          </div>
          <div className="sheet overflow-hidden">
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,1fr)_120px_10.5rem_12.5rem_11rem] gap-x-4 border-b border-rule px-6 py-2.5 text-[0.75rem] font-[650] text-ink-3 md:grid"
            >
              <span>Proveedor</span>
              <span>Con prueba</span>
              <span className="text-right">Facturado</span>
              <span>Decisión</span>
              <span className="text-right">Estado</span>
            </div>
            {shown.length === 0 ? (
              <p className="px-6 py-8 text-ink-2">Ninguna cuenta tiene esa decisión todavía.</p>
            ) : (
              <ol className="divide-y divide-rule">
                {shown.map((b, i) => (
                  <Row key={b.id} b={b} index={fresh(b.id) ? 0 : i} />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
