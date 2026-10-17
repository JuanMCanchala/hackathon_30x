'use client';

import clsx from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { formatPercent, payoutMethodLabel } from '@mandato/domain';
import type { InvoiceDetail } from '@/lib/types';

function Confidence({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-2" title={`Confianza ${formatPercent(value)}`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-rule">
        <span
          className={clsx('block h-full rounded-full', value >= 0.85 ? 'bg-paid' : 'bg-pending')}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs text-ink-3 tabular-nums">
        {Math.round(value * 100)}
      </span>
    </span>
  );
}

export function ExtractionPanel({ invoice }: { invoice: InvoiceDetail }) {
  const x = invoice.extraction;
  const meta = invoice.extractionMeta;
  if (!x) {
    return (
      <div className="rounded-[14px] bg-pending-tint p-4 text-sm text-ink">
        <p className="font-[600]">No hubo lectura del documento.</p>
        <p className="mt-1 text-ink-2">
          {meta.error ?? 'El lector no devolvió datos.'} Por eso el agente no pudo decidir solo.
        </p>
      </div>
    );
  }
  const c = x.confidence;
  const rows: { label: string; value: string | null; confidence?: number }[] = [
    {
      label: 'Quién cobra',
      value: [x.issuer.name, x.issuer.taxId].filter(Boolean).join(', ') || null,
      confidence: c.issuer,
    },
    {
      label: 'Dirigida a',
      value: [x.billTo.name, x.billTo.taxId].filter(Boolean).join(', ') || null,
    },
    { label: 'Número', value: x.invoiceNumber, confidence: c.invoiceNumber },
    { label: 'Emisión', value: x.issueDate, confidence: c.issueDate },
    { label: 'Vencimiento', value: x.dueDate, confidence: x.dueDate ? c.dueDate : undefined },
    { label: 'Periodo', value: x.servicePeriod },
    { label: 'Moneda', value: x.currency, confidence: c.currency },
    { label: 'Total', value: x.total, confidence: c.total },
    { label: 'En letras', value: x.amountInWords },
    {
      label: 'Datos de pago',
      value: x.payout.destination
        ? `${payoutMethodLabel(x.payout.method)} ${x.payout.destination}`
        : null,
      confidence: x.payout.destination ? c.payout : undefined,
    },
  ];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-2">
        El lector no decide: solo extrae lo que dice el documento y qué tan seguro está de cada
        dato.
      </p>
      <dl className="divide-y divide-rule overflow-hidden rounded-[14px] bg-sheet-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]"
          >
            <dt className="col-span-2 text-xs text-ink-3 sm:col-span-1 sm:text-sm">{row.label}</dt>
            <dd className={clsx('min-w-0 break-words', row.value ? 'text-ink' : 'text-ink-3')}>
              {row.value ?? 'no aparece'}
            </dd>
            <dd>{row.confidence !== undefined && <Confidence value={row.confidence} />}</dd>
          </div>
        ))}
      </dl>
      {(x.agentInstructions.detected || meta.scanPhrases.length > 0) && (
        <div className="flex gap-2 rounded-lg border border-held/30 bg-held-tint/60 p-3 text-sm text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-held" aria-hidden />
          <p>
            Texto dirigido al agente
            {x.agentInstructions.quote ? `: «${x.agentInstructions.quote}»` : ''}
            {meta.scanPhrases.length > 0 &&
              ` El detector determinista también encontró: ${meta.scanPhrases.map((p) => `«${p}»`).join(', ')}.`}
          </p>
        </div>
      )}
      {x.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-2">
          {x.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
