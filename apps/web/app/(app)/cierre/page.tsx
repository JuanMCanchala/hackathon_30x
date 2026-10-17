'use client';

import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatDate, formatMoney, formatPeriod, formatUsd } from '@mandato/domain';
import { Empty, PageHeader, Skeleton, StatusTag } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { settledSummary } from '@/lib/outcomes';
import type { CloseRow, MonthClose } from '@/lib/types';

const day = (iso: string) => formatDate(iso.slice(0, 10)).replace(/ \d{4}$/, '');
const monthName = (period: string) => {
  const name = formatPeriod(period);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

function Transfer({ row }: { row: CloseRow }) {
  const p = row.payment;
  if (!p) {
    return (
      <span className="text-sm text-ink-3">
        {row.status === 'PAID' || row.status === 'APPROVED'
          ? 'Sin transferencia'
          : row.status === 'PENDING_APPROVAL'
            ? 'Espera aprobación'
            : 'No se paga'}
      </span>
    );
  }
  return (
    <span className="grid text-sm">
      <span className="text-ink">
        {p.railName},{' '}
        {p.status === 'scheduled'
          ? `sale el ${day(p.scheduledFor)}`
          : p.settledAt
            ? `llegó el ${day(p.settledAt)}`
            : `salió el ${day(p.scheduledFor)}`}
      </span>
      {p.reference && <span className="font-mono text-[0.72rem] text-ink-3">{p.reference}</span>}
    </span>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="sheet p-5">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="t-figure mt-1 text-[2rem] leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm text-ink-3">{note}</p>
    </div>
  );
}

export default function CierrePage() {
  const [period, setPeriod] = useState<string | null>(null);
  const { data, isLoading } = useApi<MonthClose>(
    `/api/v1/close${period ? `?period=${period}` : ''}`,
  );

  if (isLoading && !data) return <Skeleton className="h-[520px]" />;
  if (!data || !data.period) {
    return (
      <Empty title="Todavía no hay un mes que cerrar">
        Procesa agosto en el recorrido guiado: el cierre se arma solo con cada decisión.
      </Empty>
    );
  }

  const t = data.totals;
  const month = monthName(data.period);

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Cierre del mes"
        lead="Lo que antes se conciliaba a mano en una hoja de cálculo: qué se pagó, quién lo decidió, por qué y con qué transferencia. Listo para el contador."
        actions={
          <>
            <select
              value={data.period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 rounded-full bg-fill px-4 text-[0.94rem] font-[560] text-ink"
              aria-label="Mes"
            >
              {data.periods.map((p) => (
                <option key={p} value={p}>
                  {monthName(p)}
                </option>
              ))}
            </select>
            <a
              href={`/api/v1/close.csv?period=${data.period}`}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-marker px-4 text-[0.94rem] font-[620] text-on-marker hover:brightness-95"
            >
              <Download className="size-4" aria-hidden /> Descargar para Excel
            </a>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={`Pagado en ${formatPeriod(data.period)}`}
          value={formatUsd(t.paidUsdCents)}
          note={`${t.paidByAgent} solas por el agente y ${t.approved} con aprobación`}
        />
        <Figure
          label="Transferencias"
          value={formatUsd(t.sentUsdCents)}
          note={
            t.scheduledUsdCents > 0
              ? `ya salieron; ${formatUsd(t.scheduledUsdCents)} programadas`
              : 'ya salieron todas'
          }
        />
        <Figure
          label="Frenadas o rechazadas"
          value={String(t.held + t.rejected)}
          note={`${t.held} por el agente y ${t.rejected} por una persona`}
        />
        <Figure
          label="Por aprobar"
          value={String(t.pending)}
          note={t.pending ? 'esperan a una persona' : 'nada pendiente'}
        />
      </section>

      {t.byCurrency.length > 0 && (
        <p className="-mt-4 flex flex-wrap gap-2 text-sm text-ink-2">
          Pagado por moneda:
          {t.byCurrency.map((c) => (
            <span key={c.currency} className="rounded-full bg-fill px-3 py-0.5 text-ink">
              {formatMoney(c.amountMinor, c.currency)}{' '}
              <span className="text-ink-3">
                ({c.count} {c.count === 1 ? 'pago' : 'pagos'})
              </span>
            </span>
          ))}
        </p>
      )}

      <section className="grid gap-3">
        <h2 className="t-h2 text-ink">
          {month}, cobro por cobro{' '}
          <span className="font-sans text-base font-[450] text-ink-3">{t.bills} cobros</span>
        </h2>
        <ul className="sheet divide-y divide-rule overflow-hidden">
          {data.rows.map((row) => (
            <li
              key={row.invoiceId}
              className="grid gap-x-6 gap-y-2 px-5 py-4 lg:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)]"
            >
              <div className="min-w-0">
                <Link
                  href={`/facturas/${row.invoiceId}`}
                  className="font-[620] text-ink hover:underline"
                >
                  {row.payeeName}
                </Link>
                <p className="text-sm text-ink-3">
                  {row.ref}
                  {row.invoiceNumber ? `, factura ${row.invoiceNumber}` : ''}, llegó el{' '}
                  {day(row.receivedAt)}
                </p>
                {row.reason && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-2">
                    {settledSummary(row.status, row.decidedBy, row.reason)}
                  </p>
                )}
              </div>
              <div className="grid content-start gap-1.5 lg:justify-items-end">
                <p className="t-figure text-[1.05rem] text-ink">
                  {row.amountMinor !== null && row.currency
                    ? formatMoney(row.amountMinor, row.currency)
                    : 'Sin monto'}
                </p>
                <StatusTag status={row.status} />
              </div>
              <div className="grid content-start gap-1">
                <p className="text-sm text-ink-2">
                  Decidió:{' '}
                  <span className="font-[600] text-ink">{row.decidedBy ?? 'nadie todavía'}</span>
                </p>
                <Transfer row={row} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
