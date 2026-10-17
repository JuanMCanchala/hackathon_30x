'use client';

import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { describeMandate, formatDate, formatMoney, formatUsd } from '@mandato/domain';
import { Guilloche } from '@/components/guilloche';
import { ProposalCard } from '@/components/proposal-card';
import { ApprovalPanel } from '@/components/receipt/approval-panel';
import { DocumentViewer } from '@/components/receipt/document-viewer';
import { ExtractionPanel } from '@/components/receipt/extraction-panel';
import { LedgerTrail } from '@/components/receipt/ledger-trail';
import { RuleChecklist } from '@/components/receipt/rule-checklist';
import { Empty, Skeleton, StatusTag, fmtDateTime } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { OUTCOME_COPY, SOURCE_COPY, toneOf } from '@/lib/outcomes';
import type { InvoiceDetail } from '@/lib/types';

const STAMP_TONE = {
  paid: 'border-paid text-paid',
  held: 'border-held text-held',
  pending: 'border-pending text-pending',
  rejected: 'border-rejected text-rejected',
} as const;

function Stamp({ invoice }: { invoice: InvoiceDetail }) {
  const tone = toneOf(invoice.status);
  const label =
    invoice.status === 'APPROVED'
      ? 'Pagada con aprobación'
      : invoice.status === 'REJECTED'
        ? 'Rechazada'
        : invoice.outcome
          ? OUTCOME_COPY[invoice.outcome].stamp
          : 'Recibida';
  return (
    <div
      className={clsx(
        'stamp-in inline-block rotate-[-4deg] rounded-md border-[3px] px-4 py-2 text-center outline-1 outline-current outline-offset-[3px] [outline-style:solid]',
        STAMP_TONE[tone],
      )}
    >
      <p className="text-[1.35rem] leading-none font-[800] tracking-[-0.01em] [font-stretch:125%]">
        {label}
      </p>
      {invoice.decidedAt && (
        <p className="mt-1 text-[0.72rem] font-[600] opacity-90">
          {fmtDateTime(invoice.decidedAt)}
        </p>
      )}
    </div>
  );
}

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const {
    data: invoice,
    error,
    isLoading,
  } = useApi<InvoiceDetail>(`/api/v1/invoices/${params.id}`);

  if (error) {
    return (
      <Empty
        title="No encontramos esta factura"
        action={
          <Link href="/facturas" className="text-brand hover:underline">
            Volver a las facturas
          </Link>
        }
      >
        Puede que la demo se haya reiniciado.
      </Empty>
    );
  }
  if (isLoading || !invoice) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-[480px]" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  const d = invoice.decision;
  const name = invoice.payee?.name ?? invoice.issuerName ?? 'Quien cobra';
  const counterfactualTitle =
    invoice.outcome === 'HOLD'
      ? 'Para poder pagarla haría falta que…'
      : 'Se habría pagado sola si…';

  return (
    <div className="grid gap-6">
      <Link
        href="/facturas"
        className="inline-flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden /> Facturas
      </Link>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article className="grid gap-8">
          <header className="sheet relative overflow-hidden">
            <Guilloche
              size={420}
              bands={3}

              className="pointer-events-none absolute -top-40 -right-36 text-[var(--guilloche)] opacity-[0.14]"
            />
            <div className="relative grid gap-5 p-6 sm:p-8">
              <p className="text-sm text-ink-2">
                Comprobante {invoice.ref}, {SOURCE_COPY[invoice.source] ?? invoice.source}, recibido
                el {fmtDateTime(invoice.receivedAt)}
              </p>
              <h1 className="t-h2 max-w-2xl text-ink">{invoice.title ?? name}</h1>

              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <p className="text-sm text-ink-3">Monto</p>
                  <p className="t-display text-ink">
                    {invoice.amountMinor !== null && invoice.currency
                      ? formatMoney(invoice.amountMinor, invoice.currency)
                      : 'sin monto'}
                  </p>
                  {invoice.currency !== 'USD' && invoice.usdCents !== null && (
                    <p className="text-sm text-ink-3">
                      ≈ {formatUsd(invoice.usdCents)} con la tasa de la política
                    </p>
                  )}
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pb-1.5 text-sm">
                  <dt className="text-ink-3">Para</dt>
                  <dd className="text-ink">{name}</dd>
                  {invoice.invoiceNumber && (
                    <>
                      <dt className="text-ink-3">Número</dt>
                      <dd className="text-ink">{invoice.invoiceNumber}</dd>
                    </>
                  )}
                  {invoice.dueDate && (
                    <>
                      <dt className="text-ink-3">Vence</dt>
                      <dd className="text-ink">{formatDate(invoice.dueDate)}</dd>
                    </>
                  )}
                </dl>
                {/* Like a cheque: the amount, and the stamp beside it. Padding leaves room for the tilt. */}
                <div className="px-2 pb-2 sm:ml-auto">
                  <Stamp invoice={invoice} />
                </div>
              </div>

              {d && <p className="voice max-w-2xl text-ink">{d.summary}</p>}

              {d && d.counterfactual.length > 0 && (
                <div className="rounded-xl border border-rule bg-sheet-2 p-4 sm:p-5">
                  <p className="text-[0.95rem] font-[650] text-ink">{counterfactualTitle}</p>
                  <ul className="mt-2 grid gap-1.5">
                    {d.counterfactual.map((c) => (
                      <li key={c} className="voice text-[1.05rem] text-ink-2">
                        {c}.
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {invoice.mandate && (
                <p className="text-sm text-ink-2">
                  Acuerdo aplicado: {describeMandate(invoice.mandate.terms)}, versión{' '}
                  {invoice.mandate.version}, firmado por{' '}
                  {invoice.mandate.signedBy.map((s) => s.name).join(' y ')}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <StatusTag status={invoice.status} />
                {d && (
                  <span className="text-xs text-ink-3">
                    Política v{d.policyVersion}, motor {d.engineVersion}
                  </span>
                )}
              </div>
            </div>
            <div className="perforation" aria-hidden />
          </header>

          {invoice.approval && (
            <div className="sheet p-6">
              <ApprovalPanel invoice={invoice} />
            </div>
          )}

          {invoice.proposal && <ProposalCard proposal={{ ...invoice.proposal }} />}

          {d && (
            <div className="sheet p-6">
              <RuleChecklist results={d.results} />
            </div>
          )}

          <section className="sheet p-6">
            <h2 className="t-h3 mb-4 text-ink">Registro encadenado</h2>
            <LedgerTrail entries={invoice.ledger} />
            <p className="mt-4 text-sm text-ink-3">
              Cada asiento guarda la huella del anterior. Si alguien edita uno, el auditor lo
              detecta.{' '}
              <Link href="/auditoria" className="text-brand hover:underline">
                Ver la auditoría
              </Link>
              .
            </p>
          </section>
        </article>

        <aside className="grid gap-6 xl:sticky xl:top-20">
          <section className="sheet p-5">
            <h2 className="t-h3 mb-3 text-ink">Documento original</h2>
            <DocumentViewer invoice={invoice} />
          </section>
          <section className="sheet p-5">
            <h2 className="t-h3 mb-3 text-ink">Lo que leyó el agente</h2>
            <ExtractionPanel invoice={invoice} />
          </section>
        </aside>
      </div>
    </div>
  );
}
