'use client';

import { DEFAULT_POLICY, hoursOf } from '@recibido/domain';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ticksOf } from '@/components/evidence';
import { OutcomeStamp, StatusChip } from '@/components/outcome';
import { fillDurationMs, ProofBar } from '@/components/proof-bar';
import { Mono } from '@/components/ui';
import { useBill } from '@/lib/api';
import { formatDateTime, formatHours, formatMoney, isCurrency } from '@/lib/format';
import type { BillReceipt } from '@/lib/types';
import { ResolvePanel } from './resolve';
import {
  ChecksSection,
  ConversationSection,
  CounterfactualSection,
  HistorySection,
  LinesSection,
  PaymentSection,
  ReadingSection,
} from './sections';

const CHANNEL: Record<string, string> = {
  pdf: 'PDF',
  email: 'correo',
  chat: 'chat',
  portal: 'portal del proveedor',
};

export function Receipt({ id }: { id: string }) {
  const { data: r, error, isLoading, mutate } = useBill(id);
  if (error && !r)
    return (
      <div className="grid gap-4">
        <BackLink />
        <p className="sheet p-6 text-ink-2">
          {error.status === 404
            ? 'Esta cuenta no existe en la demo. Si reiniciaste la demo, vuelve a la lista de cuentas.'
            : `No pudimos leer la cuenta: ${error.message}`}
        </p>
      </div>
    );
  if (isLoading || !r)
    return <div className="sheet h-96" aria-busy aria-label="Cargando el recibo" />;
  return <ReceiptBody r={r} refresh={() => void mutate()} />;
}

function BackLink() {
  return (
    <Link
      href="/cuentas"
      className="inline-flex w-fit items-center gap-1.5 text-[0.875rem] font-[650] text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Cuentas
    </Link>
  );
}

function ReceiptBody({ r, refresh }: { r: BillReceipt; refresh: () => void }) {
  const currency =
    r.amounts?.currency ?? (isCurrency(r.reading?.currency) ? r.reading.currency : null);
  const ticks = ticksOf(r.lines);
  const latest = r.decisions.at(-1);
  // the stamp waits for the bar the first time; a later decision (a poll) lands it at once
  const [firstSeq] = useState(latest?.seq);
  const stampDelay = latest?.seq === firstSeq ? fillDurationMs(ticks.length) : 0;
  const hours = hoursOf(r.lines, r.contract);
  const a = r.amounts;

  return (
    <article className="grid gap-10">
      <header className="grid gap-5">
        <BackLink />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {r.outcome && latest && (
            <OutcomeStamp
              key={latest.seq}
              outcome={r.outcome}
              size="lg"
              land
              delayMs={stampDelay}
            />
          )}
          <StatusChip status={r.bill.status} />
        </div>
        {r.bill.status === 'SUPERSEDED' && r.headBillId !== r.bill.id && (
          <p className="text-[0.9375rem] text-ink-2">
            El proveedor envió una versión corregida.{' '}
            <Link
              href={`/cuentas/${r.chain.find((c) => c.id === r.headBillId)?.datasetId ?? r.headBillId}`}
              className="font-[650] text-ink underline"
            >
              Ver la versión vigente
            </Link>
          </p>
        )}
        <p className="max-w-[60ch] text-[1.25rem] leading-[1.4] font-[550] text-ink">
          {r.summary ?? 'Todavía no hay una decisión para esta cuenta.'}
        </p>
        <p className="text-[0.9375rem] text-ink-2">
          <span className="font-[700] text-ink">
            {r.vendor?.name ?? r.reading?.vendorName ?? 'Proveedor sin identificar'}
          </span>
          {' · '}
          <Mono>{r.reading?.invoiceNumber ?? 'sin número'}</Mono>
          {' · llegó por '}
          {CHANNEL[r.bill.channel] ?? r.bill.channel} el{' '}
          <Mono>{formatDateTime(r.bill.receivedAt)}</Mono>
          {r.contract && (
            <>
              {' · '}
              {r.contract.title}
            </>
          )}
        </p>
      </header>

      {r.bill.status === 'ESCALATED' && (
        <ResolvePanel
          billId={r.bill.id}
          owedMinor={(a?.billedMinor ?? 0) - r.bill.casePaidMinor}
          currency={currency}
          destination={r.vendor?.payout.display ?? null}
          amountUncertain={
            !r.reading?.total?.trim() ||
            !r.reading.currency?.trim() ||
            r.reading.confidence.total < DEFAULT_POLICY.minReadingConfidence
          }
          onDone={refresh}
        />
      )}

      {a && currency && (
        <section aria-label="La prueba" className="sheet grid gap-5 px-4 py-5 sm:px-6 sm:py-6">
          <ProofBar
            size="lg"
            billedMinor={a.billedMinor}
            evidencedMinor={a.evidencedMinor}
            ticks={ticks}
            currency={currency}
            legend={
              hours
                ? {
                    proven: `${formatHours(hours.evidenced)} con prueba`,
                    unproven: `${formatHours(Math.max(hours.billed - hours.evidenced, 0))} sin prueba`,
                  }
                : undefined
            }
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-5 sm:grid-cols-5">
            {[
              ['Facturado', a.billedMinor],
              ['Con prueba', a.evidencedMinor],
              ['Ya pagado', a.alreadyPaidMinor],
              ['Se paga ahora', a.payNowMinor],
              ['Se pide al proveedor', a.askMinor],
            ].map(([label, minor]) => (
              <div key={label}>
                <dt className="text-[0.8125rem] text-ink-3">{label}</dt>
                <dd className="t-mono mt-0.5 text-[1rem] font-[600] text-ink">
                  {formatMoney(minor as number, currency)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {currency && <LinesSection r={r} currency={currency} />}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <ChecksSection checks={r.checks} />
        <div className="grid content-start gap-10">
          <CounterfactualSection r={r} />
          <ReadingSection r={r} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
        <PaymentSection r={r} />
        <ConversationSection r={r} />
      </div>

      <HistorySection r={r} />

      {r.engineVersion && (
        <p className="text-[0.8125rem] text-ink-3">
          Decidido por el motor <Mono>{r.engineVersion}</Mono>, en código: el modelo de lenguaje
          solo lee la cuenta y cruza sus líneas.
        </p>
      )}
    </article>
  );
}
