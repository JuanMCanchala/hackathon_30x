'use client';

import Link from 'next/link';
import { OutcomeStamp, StatusChip } from '@/components/outcome';
import { Mono, PageHeader } from '@/components/ui';
import { useBills } from '@/lib/api';
import { formatDate, formatDecimal } from '@/lib/format';

// A first ledger of the bills; Task 13 adds the inline proof bar, filters and upload.
export default function BillsPage() {
  const { data, error, isLoading } = useBills();
  return (
    <>
      <PageHeader
        title="Cuentas"
        lead="Cada cuenta que llegó, con lo que Recibido decidió y en qué va. La más reciente arriba."
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
        <ol className="sheet divide-y divide-rule">
          {data.map((b) => (
            <li key={b.id}>
              <Link
                href={`/cuentas/${b.datasetId ?? b.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors duration-150 hover:bg-fill sm:grid-cols-[minmax(0,1fr)_10rem_14rem_12rem] sm:px-6"
              >
                <span className="min-w-0">
                  <span className="block truncate font-[700]">
                    {b.vendorName ?? 'Proveedor sin identificar'}
                  </span>
                  <Mono className="text-[0.8125rem] text-ink-3">
                    {b.invoiceNumber ?? 'Sin número'} · {formatDate(b.receivedAt)}
                  </Mono>
                </span>
                <Mono className="text-right text-[0.9375rem]">
                  {formatDecimal(b.total, b.currency)}
                </Mono>
                {/* phones: stamp and chip share a wrapping row; from sm they are grid cells */}
                <span className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:contents">
                  <span className="sm:justify-self-end">
                    {b.outcome && <OutcomeStamp outcome={b.outcome} size="sm" />}
                  </span>
                  <span className="sm:justify-self-end">
                    <StatusChip status={b.status} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
