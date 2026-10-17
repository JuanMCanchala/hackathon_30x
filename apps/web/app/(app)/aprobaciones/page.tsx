'use client';

import Link from 'next/link';
import { formatMoney, formatUsd } from '@mandato/domain';
import { ApprovalPanel } from '@/components/receipt/approval-panel';
import { Empty, PageHeader, Skeleton, fmtDateTime } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { SOURCE_COPY } from '@/lib/outcomes';
import type { InvoiceDetail } from '@/lib/types';

export default function AprobacionesPage() {
  const { data, isLoading } = useApi<InvoiceDetail[]>('/api/v1/approvals');

  return (
    <div>
      <PageHeader
        title="Por aprobar"
        lead="Cobros que el agente no pagó solo. Arriba de cada uno está el motivo; abajo, lo que faltó para pagarlo sin ti."
      />
      {isLoading && !data ? (
        <Skeleton className="h-96" />
      ) : !data || data.length === 0 ? (
        <Empty title="Nada esperando aprobación">
          Cuando un cobro se salga de lo firmado aparecerá aquí, con el motivo arriba.
        </Empty>
      ) : (
        <ol className="grid gap-6">
          {data.map((invoice) => (
            <li key={invoice.id} className="sheet overflow-hidden">
              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="grid content-start gap-3">
                  <p className="text-sm text-ink-3">
                    {invoice.ref}, {SOURCE_COPY[invoice.source] ?? invoice.source},{' '}
                    {fmtDateTime(invoice.receivedAt)}
                  </p>
                  <Link href={`/facturas/${invoice.id}`} className="t-h3 text-ink hover:text-brand">
                    {invoice.title ?? invoice.issuerName ?? invoice.ref}
                  </Link>
                  <p className="t-figure text-2xl text-ink">
                    {invoice.amountMinor !== null && invoice.currency
                      ? formatMoney(invoice.amountMinor, invoice.currency)
                      : 'sin monto'}
                    {invoice.currency !== 'USD' && invoice.usdCents !== null && (
                      <span className="ml-2 text-base font-[500] text-ink-3">
                        ≈ {formatUsd(invoice.usdCents)}
                      </span>
                    )}
                  </p>
                  {invoice.decision && <p className="voice text-ink">{invoice.decision.summary}</p>}
                  {invoice.decision && invoice.decision.counterfactual.length > 0 && (
                    <div className="rounded-lg bg-sheet-2 px-4 py-3">
                      <p className="text-sm font-[650] text-ink">Se habría pagado sola si…</p>
                      <ul className="mt-1 grid gap-1">
                        {invoice.decision.counterfactual.map((c) => (
                          <li key={c} className="text-sm text-ink-2">
                            {c}.
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Link
                    href={`/facturas/${invoice.id}`}
                    className="text-sm text-brand hover:underline"
                  >
                    Ver el comprobante completo y el documento
                  </Link>
                </div>
                <ApprovalPanel invoice={invoice} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
