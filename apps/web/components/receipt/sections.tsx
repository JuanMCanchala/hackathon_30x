import { DEFAULT_ASSUMPTIONS, DEFAULT_POLICY, OUTCOME_LABEL } from '@recibido/domain';
import clsx from 'clsx';
import { Check, Minus, Paperclip, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EvidenceRow, ticksOf } from '@/components/evidence';
import { OutcomeStamp } from '@/components/outcome';
import { ProofBar } from '@/components/proof-bar';
import { Mono } from '@/components/ui';
import {
  formatDateTime,
  formatDay,
  formatDecimal,
  formatMoney,
  formatPct,
  PAYMENT_STATUS,
  RAIL_LABEL,
  SENDER,
} from '@/lib/format';
import type { BillReceipt, Currency } from '@/lib/types';

/** A receipt section: a heading, an optional aside on its right, then a sheet. */
export function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('grid content-start gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="t-h3">{title}</h2>
        {aside && <span className="text-[0.875rem] text-ink-3">{aside}</span>}
      </div>
      <div className="sheet px-4 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

const LINE_STATUS: Record<BillReceipt['lines'][number]['status'], { text: string; ink: string }> = {
  evidenced: { text: 'Probada', ink: 'text-pay' },
  partial: { text: 'Probada en parte', ink: 'text-part' },
  missing: { text: 'Sin prueba', ink: 'text-ask' },
  not_required: { text: 'No requiere prueba', ink: 'text-ink-2' },
  unmatched: { text: 'Sin concepto en el contrato', ink: 'text-escalate' },
};

const SHOWN_ITEMS = 5;

export function LinesSection({ r, currency }: { r: BillReceipt; currency: Currency }) {
  if (r.lines.length === 0)
    return (
      <Section title="Líneas">
        <p className="text-ink-2">
          No hay líneas evaluadas: la cuenta no llegó a cruzarse con un contrato.
        </p>
      </Section>
    );
  return (
    <Section
      title="Líneas"
      aside={`${r.lines.length} ${r.lines.length === 1 ? 'línea' : 'líneas'} · evidencia por línea`}
    >
      <ol className="divide-y divide-rule">
        {r.lines.map((l) => {
          const match = r.matches?.find((m) => m.lineIndex === l.lineIndex);
          const status = LINE_STATUS[l.status];
          const unit = r.reading?.lines[l.lineIndex]?.unit === 'hour' ? ' h' : '';
          const items = [
            ...l.evidence.map((e) => ({ e, counted: true })),
            ...l.supporting.map((e) => ({ e, counted: false })),
          ];
          return (
            <li key={l.lineIndex} className="grid gap-3 py-4 first:pt-1 last:pb-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <p className="font-[700]">{l.description}</p>
                  <p className="text-[0.875rem] text-ink-3">
                    {l.termTitle ? `Concepto: ${l.termTitle}` : 'Sin concepto del contrato'}
                    {match && (
                      <>
                        {' · '}cruce <Mono>{formatPct(Math.round(match.confidence * 100))}</Mono>
                      </>
                    )}
                  </p>
                </div>
                <span className={clsx('text-[0.875rem] font-[700]', status.ink)}>
                  {status.text}
                </span>
              </div>
              <ProofBar
                size="sm"
                billedMinor={l.billedMinor}
                evidencedMinor={l.status === 'not_required' ? l.billedMinor : l.evidencedMinor}
                ticks={ticksOf([l])}
                currency={currency}
              />
              <dl className="t-mono grid grid-cols-2 gap-x-4 text-[0.8125rem] sm:flex sm:gap-8">
                <div>
                  <dt className="font-sans text-ink-3">Facturado</dt>
                  <dd>
                    {formatMoney(l.billedMinor, currency)}
                    {unit && l.billedQuantity && ` · ${l.billedQuantity}${unit}`}
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-ink-3">Con prueba</dt>
                  <dd>
                    {formatMoney(l.evidencedMinor, currency)}
                    {unit && l.evidencedQuantity && ` · ${l.evidencedQuantity}${unit}`}
                  </dd>
                </div>
              </dl>
              {match?.reason && <p className="text-[0.875rem] text-ink-2">{match.reason}</p>}
              {items.length > 0 && (
                <div>
                  <ul className="divide-y divide-rule border-t border-rule">
                    {items.slice(0, SHOWN_ITEMS).map(({ e, counted }) => (
                      <EvidenceRow key={e.id} item={e} counted={counted} />
                    ))}
                  </ul>
                  {items.length > SHOWN_ITEMS && (
                    <details className="group">
                      <summary className="cursor-pointer py-2 text-[0.875rem] font-[650] text-ink underline">
                        <span className="group-open:hidden">
                          Ver los {items.length} elementos de evidencia
                        </span>
                        <span className="hidden group-open:inline">Ocultar</span>
                      </summary>
                      <ul className="divide-y divide-rule border-t border-rule">
                        {items.slice(SHOWN_ITEMS).map(({ e, counted }) => (
                          <EvidenceRow key={e.id} item={e} counted={counted} />
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

const STAGES: { id: BillReceipt['checks'][number]['stage']; label: string }[] = [
  { id: 'lectura', label: 'Lectura' },
  { id: 'proveedor', label: 'Proveedor' },
  { id: 'duplicado', label: 'Duplicados' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'evidencia', label: 'Evidencia' },
  { id: 'plazo', label: 'Plazo' },
];

const CHECK_ICON = {
  pass: { Icon: Check, ink: 'text-pay', text: 'Pasa' },
  fail: { Icon: X, ink: 'text-escalate', text: 'No pasa' },
  not_run: { Icon: Minus, ink: 'text-ink-3', text: 'No se corrió' },
} as const;

export function ChecksSection({ checks }: { checks: BillReceipt['checks'] }) {
  if (checks.length === 0) return null;
  const passing = checks.filter((c) => c.status === 'pass').length;
  return (
    <Section title="Chequeos" aside={`${passing} de ${checks.length} pasan`}>
      <div className="grid gap-4">
        {STAGES.map((stage) => {
          const group = checks.filter((c) => c.stage === stage.id);
          if (group.length === 0) return null;
          return (
            <div key={stage.id}>
              <h3 className="text-[0.75rem] font-[750] tracking-[0.04em] text-ink-3 uppercase">
                {stage.label}
              </h3>
              <ul className="mt-1 divide-y divide-rule">
                {group.map((c) => {
                  const { Icon, ink, text } = CHECK_ICON[c.status];
                  return (
                    <li
                      key={c.id}
                      className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2 py-2 text-[0.875rem]"
                    >
                      <Icon className={clsx('mt-0.5 size-4', ink)} aria-hidden strokeWidth={2.5} />
                      <span className="sr-only">{text}:</span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-[650] text-ink">{c.label}</span>
                          {c.status === 'fail' && (
                            <span className="text-[0.8125rem] text-ink-3">
                              lleva a {OUTCOME_LABEL[c.onFail].toLowerCase()}
                            </span>
                          )}
                        </p>
                        <p className="text-ink-2">{c.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function CounterfactualSection({ r }: { r: BillReceipt }) {
  const items = r.counterfactual;
  return (
    <Section title="Para pagarla">
      {items.length === 0 ? (
        <p className="text-ink-2">
          {r.outcome === 'PAY'
            ? 'Nada más: todo lo facturado está probado y dentro del contrato.'
            : 'No hay un cambio que la haga pagable: la decisión no depende de la prueba.'}
        </p>
      ) : (
        <>
          <p className="text-[0.875rem] text-ink-3">Recibido la pagaría completa si llega:</p>
          <ul className="mt-2 grid gap-2">
            {items.map((t) => (
              <li key={t} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-2">
                <span aria-hidden className="mt-2 size-1.5 bg-stamp" />
                <span className="text-ink">{t}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function confidenceCell(value: number) {
  const low = value < DEFAULT_POLICY.minReadingConfidence;
  return (
    <Mono className={clsx('text-right', low ? 'font-[700] text-escalate' : 'text-ink-2')}>
      {formatPct(Math.round(value * 100))}
      {low && <span className="sr-only"> (baja)</span>}
    </Mono>
  );
}

const PROVIDER: Record<string, string> = {
  replay: 'respuesta grabada',
  reference: 'lectura de referencia',
  deepseek: 'DeepSeek en vivo',
  openrouter: 'OpenRouter en vivo',
  none: 'sin modelo',
};

function modelLine(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const model = typeof meta.model === 'string' ? meta.model : null;
  const provider = typeof meta.provider === 'string' ? meta.provider : null;
  return [model, provider ? (PROVIDER[provider] ?? provider) : null].filter(Boolean).join(' · ');
}

export function ReadingSection({ r }: { r: BillReceipt }) {
  const x = r.reading;
  const reader = modelLine(r.readingMeta);
  const matcher = modelLine(r.matchMeta);
  const error = typeof r.readingMeta?.error === 'string' ? r.readingMeta.error : null;
  return (
    <Section title="Lo que leyó" aside={r.bill.document?.filename}>
      {!x ? (
        <p className="text-ink-2">
          No pudimos leer la cuenta{error ? `: ${error}` : '.'} Por eso la decide una persona.
        </p>
      ) : (
        <table className="w-full text-[0.875rem]">
          <caption className="sr-only">Campos leídos y su confianza</caption>
          <thead>
            <tr className="text-left text-[0.75rem] text-ink-3">
              <th className="pb-1 font-[650]">Campo</th>
              <th className="pb-1 font-[650]">Valor</th>
              <th className="pb-1 text-right font-[650]">Confianza</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {[
              ['Proveedor', x.vendorName ?? '—', x.confidence.vendor],
              ['Número', x.invoiceNumber ?? '—', x.confidence.invoiceNumber],
              ['Total', formatDecimal(x.total, x.currency), x.confidence.total],
              ['Moneda', x.currency ?? '—', x.confidence.currency],
              [
                'Fechas',
                `${x.issueDate ? formatDay(x.issueDate) : '—'} · vence ${x.dueDate ? formatDay(x.dueDate) : '—'}`,
                x.confidence.dates,
              ],
              [
                'Líneas',
                `${x.lines.length} ${x.lines.length === 1 ? 'línea' : 'líneas'}`,
                x.confidence.lines,
              ],
            ].map(([field, value, conf]) => (
              <tr key={field as string}>
                <th scope="row" className="py-1.5 pr-3 text-left font-[600] text-ink-3">
                  {field}
                </th>
                <td className="t-mono py-1.5 pr-3 break-words text-ink">{value}</td>
                <td className="py-1.5">{confidenceCell(conf as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {x && (x.revisionOf || x.instructionsToAgent) && (
        <ul className="mt-3 grid gap-1 text-[0.875rem] text-ink-2">
          {x.revisionOf && (
            <li>
              Dice que corrige la cuenta <Mono>{x.revisionOf}</Mono>.
            </li>
          )}
          {x.instructionsToAgent && (
            <li className="text-escalate">Trae texto dirigido a un sistema automático.</li>
          )}
        </ul>
      )}
      {(reader || matcher) && (
        <p className="mt-3 border-t border-rule pt-3 text-[0.8125rem] text-ink-3">
          {reader && (
            <>
              Leyó: <Mono>{reader}</Mono>.{' '}
            </>
          )}
          {matcher && (
            <>
              Cruzó las líneas: <Mono>{matcher}</Mono>.{' '}
            </>
          )}
          El modelo lee; los montos, topes y fechas los calcula el código.
        </p>
      )}
    </Section>
  );
}

export function PaymentSection({ r }: { r: BillReceipt }) {
  return (
    <Section title="Plan de pago">
      {r.payments.length === 0 ? (
        <p className="text-ink-2">Sin pago: nada de esta cuenta está aprobado para pagar.</p>
      ) : (
        <ul className="divide-y divide-rule">
          {r.payments.map((p) => {
            const status = PAYMENT_STATUS[p.status];
            return (
              <li key={p.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <Mono className="text-[1.125rem] font-[650]">
                    {formatMoney(p.amountMinor, p.currency)}
                  </Mono>
                  <span className={clsx('text-[0.875rem] font-[700]', status.ink)}>
                    {status.text}
                    {p.decidedBy === 'person' && ' · por una persona'}
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[0.875rem]">
                  <div>
                    <dt className="text-ink-3">Fecha</dt>
                    <dd className="t-mono">{formatDay(p.executedAt ?? p.plan.payOn)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Riel</dt>
                    <dd className="t-mono">{RAIL_LABEL[p.rail] ?? p.rail}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Rendimiento conservado</dt>
                    <dd className="t-mono">{formatMoney(p.plan.yieldKeptUsdMinor, 'USD')}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Comisiones ahorradas</dt>
                    <dd className="t-mono">{formatMoney(p.plan.feesSavedUsdMinor, 'USD')}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-ink-3">Destino registrado</dt>
                    <dd className="t-mono">
                      {p.destinationDisplay} · ref. {p.reference}
                    </dd>
                  </div>
                </dl>
                <p className="text-[0.875rem] text-ink-2">{p.plan.reason}</p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-rule pt-3 text-[0.8125rem] text-ink-3">
        {DEFAULT_ASSUMPTIONS.text}
      </p>
    </Section>
  );
}

export function ConversationSection({ r }: { r: BillReceipt }) {
  return (
    <Section
      title="Conversación con el proveedor"
      aside={
        r.messages.length > 0 && (
          <Link href="/conversaciones" className="text-ink underline">
            Ver en conversaciones
          </Link>
        )
      }
    >
      {r.messages.length === 0 ? (
        <p className="text-ink-2">No hizo falta escribirle al proveedor.</p>
      ) : (
        <ol className="grid gap-3">
          {r.messages.map((m) => {
            const fromVendor = m.sender === 'vendor';
            return (
              <li
                key={m.id}
                className={clsx(
                  'max-w-[60ch] rounded-[10px] px-4 py-3',
                  fromVendor ? 'ml-auto bg-fill' : 'border border-rule',
                )}
              >
                <p className="flex flex-wrap justify-between gap-x-4 text-[0.8125rem]">
                  <span className="font-[700] text-ink">
                    {fromVendor ? (r.vendor?.contactName ?? 'Proveedor') : SENDER[m.sender]}
                  </span>
                  <Mono className="text-ink-3">{formatDateTime(m.at)}</Mono>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{m.body}</p>
                {m.attachmentBillId && (
                  <Link
                    href={`/cuentas/${r.chain.find((c) => c.id === m.attachmentBillId)?.datasetId ?? m.attachmentBillId}`}
                    className="mt-2 inline-flex items-center gap-1.5 text-[0.875rem] text-ink underline"
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    Cuenta corregida adjunta
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

const ACTION = { approve: 'aprobó', reject: 'rechazó' } as Record<string, string>;

export function HistorySection({ r }: { r: BillReceipt }) {
  const entries = [
    ...r.decisions.map((d) => ({ at: d.at, key: d.id, kind: 'decision' as const, d })),
    ...r.humanActions.map((a) => ({ at: a.at, key: a.id, kind: 'person' as const, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));
  return (
    <Section title="Historial de decisiones">
      {entries.length === 0 ? (
        <p className="text-ink-2">Todavía no hay decisiones.</p>
      ) : (
        <ol className="grid gap-4">
          {entries.map((e) => (
            <li key={e.key} className="grid gap-1.5">
              <p className="flex flex-wrap items-center justify-between gap-2">
                {e.kind === 'decision' ? (
                  <OutcomeStamp outcome={e.d.outcome} size="sm" />
                ) : (
                  <span className="font-[700]">
                    {e.a.actor} {ACTION[e.a.action] ?? e.a.action}
                  </span>
                )}
                <Mono className="text-[0.8125rem] text-ink-3">{formatDateTime(e.at)}</Mono>
              </p>
              <p className="text-[0.875rem] text-ink-2">
                {e.kind === 'decision' ? e.d.summary : (e.a.note ?? 'Sin nota.')}
              </p>
            </li>
          ))}
        </ol>
      )}
      {r.chain.length > 1 && (
        <div className="mt-4 border-t border-rule pt-3">
          <h3 className="text-[0.75rem] font-[750] tracking-[0.04em] text-ink-3 uppercase">
            Versiones de la cuenta
          </h3>
          <ol className="mt-1 grid gap-1 text-[0.875rem]">
            {[...r.chain].reverse().map((c, i) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-x-3">
                <Link
                  href={`/cuentas/${c.datasetId ?? c.id}`}
                  aria-current={c.id === r.bill.id ? 'page' : undefined}
                  className={clsx(
                    'underline',
                    c.id === r.bill.id ? 'font-[700] text-ink' : 'text-ink-2',
                  )}
                >
                  {i === 0 ? 'Original' : `Corrección ${i}`}
                  {c.datasetId && <Mono> · {c.datasetId}</Mono>}
                </Link>
                <span className="text-ink-3">{c.statusLabel}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Section>
  );
}
