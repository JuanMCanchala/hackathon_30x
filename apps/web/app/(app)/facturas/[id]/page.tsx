'use client';

import clsx from 'clsx';
import { ChevronLeft, CircleCheck, CircleDashed, CircleSlash, Hand } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { describeMandate, formatDate, formatMoney, formatUsd } from '@mandato/domain';
import { AppIcon } from '@/components/brand';
import { PaymentPanel } from '@/components/payment-timeline';
import { SignalsPanel } from '@/components/radar';
import { ProposalCard } from '@/components/proposal-card';
import { ApprovalPanel } from '@/components/receipt/approval-panel';
import { DocumentViewer } from '@/components/receipt/document-viewer';
import { ExtractionPanel } from '@/components/receipt/extraction-panel';
import { LedgerTrail } from '@/components/receipt/ledger-trail';
import { ReplyPanel } from '@/components/receipt/reply-panel';
import { RuleChecklist } from '@/components/receipt/rule-checklist';
import { Empty, Skeleton, fmtDateTime } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { OUTCOME_COPY, SOURCE_COPY, toneOf } from '@/lib/outcomes';
import type { InvoiceDetail } from '@/lib/types';

const PASS_ICON = { paid: CircleCheck, held: Hand, pending: CircleDashed, rejected: CircleSlash };

function passLabel(invoice: InvoiceDetail): string {
  if (invoice.status === 'APPROVED') return 'Pagada con aprobación';
  if (invoice.status === 'REJECTED') return 'Rechazada';
  return invoice.outcome ? OUTCOME_COPY[invoice.outcome].stamp : 'Recibida';
}

/** The decision as a Wallet pass: its color is the outcome; the stub carries the reason. */
function DecisionPass({ invoice, name }: { invoice: InvoiceDetail; name: string }) {
  const tone = toneOf(invoice.status);
  const Icon = PASS_ICON[tone];
  const fields: [string, string][] = [
    ['Para', name],
    ...(invoice.invoiceNumber ? [['Número', invoice.invoiceNumber] as [string, string]] : []),
    ...(invoice.dueDate ? [['Vence', formatDate(invoice.dueDate)] as [string, string]] : []),
    ['Llegó por', SOURCE_COPY[invoice.source] ?? invoice.source],
  ];
  return (
    <section className={clsx('pass pass-in', `pass-${tone}`)} aria-label="Decisión">
      <div className="relative z-10 grid gap-7 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-[0.88rem] font-[560] text-white/85">
            <AppIcon className="size-6 rounded-[6px]" />
            {invoice.ref}
          </p>
          <p className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[0.88rem] font-[620] backdrop-blur-sm">
            <Icon className="size-4" strokeWidth={2.4} aria-hidden />
            {passLabel(invoice)}
          </p>
        </div>
        <div>
          <p className="text-[0.95rem] font-[560] text-white/80">{invoice.title ?? name}</p>
          <p className="t-figure mt-1 text-[clamp(2.4rem,1.6rem+3vw,3.4rem)] leading-none">
            {invoice.amountMinor !== null && invoice.currency
              ? formatMoney(invoice.amountMinor, invoice.currency)
              : 'Sin monto'}
          </p>
          {invoice.currency !== 'USD' && invoice.usdCents !== null && (
            <p className="mt-1.5 text-[0.95rem] text-white/80">
              ≈ {formatUsd(invoice.usdCents)} con la tasa de la política
            </p>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[0.78rem] font-[560] text-white/70">{label}</dt>
              <dd className="mt-0.5 text-[0.98rem] leading-snug font-[600] break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {invoice.decision && (
        <>
          <div className="pass-notch" aria-hidden />
          <p className="relative z-10 px-6 pt-5 pb-7 text-[1.1rem] leading-relaxed font-[480] sm:px-8">
            {invoice.decision.summary}
          </p>
        </>
      )}
    </section>
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
        className="inline-flex w-fit items-center gap-0.5 text-[0.95rem] text-brand hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden /> Facturas
      </Link>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article className="grid gap-8">
          <div className="grid gap-4">
            <DecisionPass invoice={invoice} name={name} />
            {d && d.counterfactual.length > 0 && (
              <div className="sheet p-5 sm:p-6">
                <p className="text-[0.95rem] font-[620] text-ink">{counterfactualTitle}</p>
                <ul className="mt-3 grid gap-2.5">
                  {d.counterfactual.map((c) => (
                    <li key={c} className="flex gap-3 text-[1rem] leading-snug text-ink">
                      <span
                        className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-brand"
                        aria-hidden
                      />
                      <span>{c}.</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.84rem] text-ink-3">
              {invoice.mandate && (
                <span>
                  Acuerdo aplicado: {describeMandate(invoice.mandate.terms)}, versión{' '}
                  {invoice.mandate.version}, firmado por{' '}
                  {invoice.mandate.signedBy.map((s) => s.name).join(' y ')}.
                </span>
              )}
              <span>
                Recibido el {fmtDateTime(invoice.receivedAt)}
                {d ? `; política v${d.policyVersion}, motor ${d.engineVersion}.` : ''}
              </span>
            </div>
          </div>

          <SignalsPanel signals={invoice.signals} />

          {invoice.payment ? (
            <div className="sheet p-6">
              <PaymentPanel payment={invoice.payment} />
            </div>
          ) : (
            (invoice.status === 'APPROVED' || invoice.status === 'PAID') && (
              <div className="sheet p-6 text-[0.95rem] text-ink-2">
                <p className="t-h3 mb-1 text-ink">La transferencia</p>
                Aprobar no basta para pagarle a quien no está registrado: el dinero solo sale a
                datos de pago verificados. Cuando se registre al beneficiario, el pago se programa.
              </div>
            )
          )}

          {invoice.status !== 'RECEIVED' && (
            <div className="sheet p-6">
              <ReplyPanel invoice={invoice} />
            </div>
          )}

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
