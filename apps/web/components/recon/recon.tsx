'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { EvidenceRow } from '@/components/evidence';
import { StatusChip } from '@/components/outcome';
import { Mono } from '@/components/ui';
import { useReconciliation } from '@/lib/api';
import { formatDay, formatDecimal, formatMoney, RAIL_LABEL } from '@/lib/format';
import type { Reconciliation, ReconciliationRow } from '@/lib/types';

const MATCH: Record<ReconciliationRow['status'], { text: string; ink: string }> = {
  matched: { text: 'Conciliada', ink: 'text-pay' },
  matched_fx: { text: 'Diferencia de cambio', ink: 'text-part' },
  fee: { text: 'Comisión', ink: 'text-ink-2' },
  returned: { text: 'Devuelta', ink: 'text-ask' },
  unmatched: { text: 'Sin conciliar', ink: 'text-escalate' },
};

const CONTRACT_TYPE: Record<string, string> = {
  hourly: 'Por horas',
  milestone: 'Por hitos',
  retainer: 'Cuota fija',
  usage: 'Por uso',
  goods: 'Bienes',
};

const PAYMENT_STATUS = { scheduled: 'Programado', sent: 'Enviado', returned: 'Devuelto' };

function MatchChip({ status }: { status: ReconciliationRow['status'] }) {
  const m = MATCH[status];
  return (
    <span
      key={status}
      className={clsx(
        'fade-in inline-flex items-center rounded-[6px] bg-[color-mix(in_srgb,currentColor_10%,var(--sheet))] px-2 py-0.5 text-[0.8125rem] font-[650] whitespace-nowrap',
        m.ink,
      )}
    >
      {m.text}
    </span>
  );
}

const usd = (minor: number) => formatMoney(minor, 'USD');

/** One link of the chain: a numbered card joined to the next by a rule. */
function ChainCard({
  step,
  title,
  last,
  children,
}: {
  step: number;
  title: string;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      {!last && (
        <span
          aria-hidden
          className="absolute top-8 bottom-0 left-[0.9375rem] w-px bg-rule-strong"
        />
      )}
      <span
        aria-hidden
        className="t-mono relative z-10 grid size-8 place-items-center rounded-[6px] border border-rule-strong bg-sheet text-[0.8125rem] font-[700]"
      >
        {step}
      </span>
      <div className={clsx('sheet grid gap-1.5 px-4 py-3', !last && 'mb-3')}>
        <h3 className="text-[0.75rem] font-[750] tracking-[0.04em] text-ink-3 uppercase">
          {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

function Chain({ row, all }: { row: ReconciliationRow; all: Reconciliation['rows'] }) {
  const p = row.payment;
  const fees = p ? all.filter((r) => r.status === 'fee' && r.payment?.id === p.id) : [];
  const evidence = row.evidence;
  return (
    <ol aria-label="Cadena de la línea seleccionada">
      <ChainCard step={1} title="Línea del banco" last={!p}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <Mono className="font-[650]">{row.line.description}</Mono>
          <Mono className="text-[1.0625rem] font-[650]">{usd(row.line.amountUsdMinor)}</Mono>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ink-2">
          <Mono>{formatDay(row.line.date)}</Mono>
          <MatchChip status={row.status} />
        </p>
        {row.note && <p className="text-[0.875rem] text-ink-2">{row.note}</p>}
        {!p && (
          <p className="text-[0.875rem] font-[650] text-escalate">
            Ningún pago de Recibido explica este movimiento: alguien de finanzas debe revisarlo.
          </p>
        )}
      </ChainCard>
      {p && (
        <ChainCard step={2} title="Pago">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Mono className="font-[650]">{p.reference}</Mono>
            <Mono className="text-[1.0625rem] font-[650]">
              {formatMoney(p.amountMinor, p.currency)}
            </Mono>
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.875rem]">
            <div>
              <dt className="text-ink-3">Riel</dt>
              <dd className="t-mono">{RAIL_LABEL[p.rail] ?? p.rail}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Estado</dt>
              <dd>
                {PAYMENT_STATUS[p.status]}
                {p.executedAt && <Mono> · {formatDay(p.executedAt)}</Mono>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Débito previsto</dt>
              <dd className="t-mono">{usd(p.plan.usdDebitMinor)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Diferencia de cambio</dt>
              <dd className={clsx('t-mono', row.fxDiffUsdMinor !== 0 && 'font-[650] text-part')}>
                {usd(row.fxDiffUsdMinor)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Comisión</dt>
              <dd className="t-mono">
                {fees.length
                  ? usd(fees.reduce((s, f) => s - f.line.amountUsdMinor, 0))
                  : usd(p.plan.feeUsdMinor)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Destino</dt>
              <dd className="t-mono break-words">{p.destinationDisplay}</dd>
            </div>
          </dl>
        </ChainCard>
      )}
      {p && row.bill && (
        <ChainCard step={3} title="Cuenta">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Link
              href={`/cuentas/${row.bill.datasetId ?? row.bill.id}`}
              className="font-[650] underline"
            >
              {row.bill.invoiceNumber ?? 'Sin número'}
              {row.bill.datasetId && <Mono className="text-ink-3"> · {row.bill.datasetId}</Mono>}
            </Link>
            <Mono>{formatDecimal(row.bill.total, row.bill.currency)}</Mono>
          </p>
          <StatusChip status={row.bill.status} className="w-fit" />
        </ChainCard>
      )}
      {p && row.contract && (
        <ChainCard step={4} title="Contrato">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-[650]">{row.contract.title}</span>
            <span className="text-[0.8125rem] text-ink-3">
              {CONTRACT_TYPE[row.contract.type] ?? row.contract.type}
            </span>
          </p>
          <p className="text-[0.875rem] text-ink-2">{row.contract.evidenceRuleText}</p>
        </ChainCard>
      )}
      {p && (
        <ChainCard step={5} title="Evidencia" last>
          {evidence.length === 0 ? (
            <p className="text-[0.875rem] text-ink-2">
              El contrato no exige evidencia: el calendario firmado basta.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-rule">
                {evidence.slice(0, 4).map((e) => (
                  <EvidenceRow key={e.id} item={e} />
                ))}
              </ul>
              {evidence.length > 4 && row.bill && (
                <Link
                  href={`/cuentas/${row.bill.datasetId ?? row.bill.id}`}
                  className="text-[0.875rem] font-[650] underline"
                >
                  Ver los {evidence.length} elementos en el recibo
                </Link>
              )}
            </>
          )}
        </ChainCard>
      )}
    </ol>
  );
}

export function ReconciliationView() {
  const { data, error } = useReconciliation();
  const [selected, setSelected] = useState<string | null>(null);
  const chainRef = useRef<HTMLDivElement>(null);

  if (error && !data)
    return <p className="sheet p-6 text-ink-2">No pudimos leer la conciliación: {error.message}</p>;
  if (!data) return <div className="sheet h-96" aria-busy aria-label="Cargando la conciliación" />;
  if (data.rows.length === 0)
    return (
      <p className="sheet p-6 text-ink-2">
        Todavía no llegó el extracto de Blinka. Llega con el cierre de octubre, el último paso del{' '}
        <Link href="/recorrido" className="text-ink underline">
          recorrido
        </Link>
        .
      </p>
    );

  // by default the bill the demo follows (Daniela's), else the first line
  const fallback =
    data.rows.find((r) => r.bill?.datasetId === 'oct-03' && r.status !== 'fee') ?? data.rows[0]!;
  const row = data.rows.find((r) => r.line.id === selected) ?? fallback;
  const t = data.totals;

  function pick(id: string) {
    setSelected(id);
    if (window.matchMedia('(max-width: 1023px)').matches)
      chainRef.current?.scrollIntoView({ block: 'start' });
  }

  return (
    <div className="grid gap-8">
      <dl className="sheet grid grid-cols-2 divide-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
        {[
          ['Líneas', String(t.lines)],
          ['Conciliadas', String(t.matched + t.matchedFx)],
          ['Comisiones', String(t.fees)],
          ['Devueltas', String(t.returned)],
          ['Sin conciliar', String(t.unmatched)],
          ['Diferencia de cambio', usd(t.fxDiffUsdMinor)],
        ].map(([label, value]) => (
          <div key={label} className="px-5 py-4">
            <dt className="text-[0.8125rem] text-ink-3">{label}</dt>
            <dd
              className={clsx(
                't-mono mt-0.5 text-[1.125rem] font-[650]',
                label === 'Sin conciliar' && t.unmatched > 0 && 'text-escalate',
              )}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-labelledby="extracto" className="grid content-start gap-3">
          <h2 id="extracto" className="t-h3">
            Extracto de Blinka
          </h2>
          <ol className="sheet divide-y divide-rule overflow-hidden">
            {data.rows.map((r) => {
              const active = r.line.id === row.line.id;
              return (
                <li key={r.line.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => pick(r.line.id)}
                    className={clsx(
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition-colors duration-150 sm:px-5',
                      active ? 'bg-fill' : 'hover:bg-fill',
                    )}
                  >
                    <Mono className="truncate text-[0.875rem] font-[600]">
                      {r.line.description}
                    </Mono>
                    <Mono
                      className={clsx(
                        'text-right text-[0.875rem]',
                        r.line.amountUsdMinor > 0 && 'text-pay',
                      )}
                    >
                      {usd(r.line.amountUsdMinor)}
                    </Mono>
                    <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Mono className="text-[0.8125rem] text-ink-3">{formatDay(r.line.date)}</Mono>
                      <MatchChip status={r.status} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {data.unmatchedPayments.length > 0 && (
            <p className="text-[0.875rem] text-escalate">
              {data.unmatchedPayments.length} pagos enviados todavía no aparecen en el extracto:{' '}
              {data.unmatchedPayments.map((p) => p.reference).join(', ')}.
            </p>
          )}
        </section>

        <div
          ref={chainRef}
          className="grid scroll-mt-20 content-start gap-3 lg:sticky lg:top-8 lg:self-start"
        >
          <h2 className="t-h3">De la línea a la evidencia</h2>
          <Chain row={row} all={data.rows} />
        </div>
      </div>
    </div>
  );
}
