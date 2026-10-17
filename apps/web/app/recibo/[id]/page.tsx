'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  describeMandate,
  formatDate,
  formatMoney,
  formatUsd,
  parseDecimalToMinor,
} from '@mandato/domain';
import { Logo } from '@/components/brand';
import { LEDGER_COPY } from '@/components/receipt/ledger-trail';
import { fmtDateTime } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { settledSummary, SOURCE_COPY, STATUS_COPY } from '@/lib/outcomes';
import type { InvoiceDetail } from '@/lib/types';

const RESULT = { pass: 'Cumple', fail: 'No cumple', skip: 'No aplica' } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-[#d9dce8] pt-5">
      <h2 className="font-display mb-3 text-[1.15rem] font-[720] text-[#10163a]">{title}</h2>
      {children}
    </section>
  );
}

function Fields({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <dl className="grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1.5 text-[0.92rem]">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[#5b6178]">{k}</dt>
            <dd className="text-[#10163a]">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

/**
 * A decision receipt a person can print or keep as a PDF: what came in, what the agent read,
 * every rule it checked, who approved, the transfer and the ledger entries that prove it.
 * Always light, whatever the screen's theme, because it is paper.
 */
export default function PrintableReceipt() {
  const { id } = useParams<{ id: string }>();
  const { data: invoice, error } = useApi<InvoiceDetail>(`/api/v1/invoices/${id}`);

  if (error) return <p className="p-10">No encontramos esta factura.</p>;
  if (!invoice) return <p className="p-10 text-[#5b6178]">Preparando el recibo…</p>;

  const d = invoice.decision;
  const x = invoice.extraction;
  const name = invoice.payee?.name ?? invoice.issuerName ?? 'Quien cobra';
  const amount =
    invoice.amountMinor !== null && invoice.currency
      ? formatMoney(invoice.amountMinor, invoice.currency)
      : 'Sin monto';
  const people = invoice.approval?.approvals ?? [];
  const totalMinor = x?.currency ? parseDecimalToMinor(x.total, x.currency) : null;
  const readTotal =
    x?.currency && totalMinor !== null ? formatMoney(totalMinor, x.currency) : (x?.total ?? null);
  const deciders = people
    .filter((a) => a.action === (invoice.status === 'REJECTED' ? 'reject' : 'approve'))
    .map((a) => a.name)
    .join(' y ');
  // A bill a person settled says so first; the agent's reason for asking follows.
  const verdict = d ? settledSummary(invoice.status, deciders || null, d.summary) : null;

  return (
    <div className="min-h-dvh bg-[#eef0f6] py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-5 flex max-w-[820px] items-center justify-between px-4 print:hidden">
        <Link
          href={`/facturas/${invoice.id}`}
          className="inline-flex items-center gap-1.5 text-[0.95rem] text-[#3a3fe0] hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver al recibo
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ffe25c] px-5 font-[650] text-[#10163a] hover:brightness-95"
        >
          <Printer className="size-4" aria-hidden /> Imprimir o guardar como PDF
        </button>
      </div>

      <article className="mx-auto grid max-w-[820px] gap-6 bg-white px-10 py-10 text-[#10163a] shadow-[0_20px_60px_-30px_rgb(16_22_58/0.35)] print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6">
          <div className="text-[#10163a]">
            <Logo />
            <p className="mt-2 text-sm text-[#5b6178]">Recibo de decisión del agente de pagos</p>
          </div>
          <div className="text-right">
            <p className="font-display text-[1.6rem] leading-none font-[780]">{invoice.ref}</p>
            <p className="mt-1 text-sm text-[#5b6178]">
              Emitido el {fmtDateTime(new Date().toISOString())}
            </p>
          </div>
        </header>

        <section className="rounded-[14px] bg-[#10163a] px-6 py-5 text-white print:[print-color-adjust:exact]">
          <p className="text-sm text-white/75">{invoice.title ?? name}</p>
          <p className="font-display mt-1 text-[2.2rem] leading-none font-[780]">{amount}</p>
          <p className="mt-3 text-[1.05rem] font-[650] text-[#ffe25c]">
            {STATUS_COPY[invoice.status]}
          </p>
          {verdict && (
            <p className="mt-1 text-[0.98rem] leading-relaxed text-white/90">{verdict}</p>
          )}
        </section>

        <Section title="El cobro">
          <Fields
            rows={[
              ['Quién cobra', name],
              ['Número de factura', invoice.invoiceNumber],
              ['Monto', amount],
              [
                'En dólares',
                invoice.currency !== 'USD' && invoice.usdCents !== null
                  ? `≈ ${formatUsd(invoice.usdCents)} con la tasa de la política`
                  : null,
              ],
              ['Emitida', invoice.issueDate ? formatDate(invoice.issueDate) : null],
              ['Vence', invoice.dueDate ? formatDate(invoice.dueDate) : null],
              ['Llegó por', SOURCE_COPY[invoice.source] ?? invoice.source],
              ['Recibida', fmtDateTime(invoice.receivedAt)],
              ['Documento', invoice.document?.filename],
              ['Huella del documento', invoice.document?.sha256],
            ]}
          />
        </Section>

        {x && (
          <Section title="Lo que leyó el agente">
            <p className="mb-2 text-sm text-[#5b6178]">
              El lector no decide: extrae los datos y dice qué tan seguro está de cada uno.
            </p>
            <Fields
              rows={[
                ['Emisor', [x.issuer.name, x.issuer.taxId].filter(Boolean).join(', ')],
                ['Dirigida a', [x.billTo.name, x.billTo.taxId].filter(Boolean).join(', ')],
                ['Total leído', readTotal],
                ['En letras', x.amountInWords],
                ['Datos de pago', x.payout.destination],
                [
                  'Texto dirigido al agente',
                  x.agentInstructions.detected
                    ? (x.agentInstructions.quote ?? 'sí, detectado')
                    : 'ninguno',
                ],
              ]}
            />
          </Section>
        )}

        {d && (
          <Section title={`Las ${d.results.length} verificaciones`}>
            <table className="w-full text-left text-[0.86rem]">
              <thead className="text-[#5b6178]">
                <tr>
                  <th className="w-[34%] py-1 pr-3 font-[560]">Regla</th>
                  <th className="w-[13%] py-1 pr-3 font-[560]">Resultado</th>
                  <th className="py-1 font-[560]">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e8f0]">
                {d.results.map((r) => (
                  <tr key={r.id} className="break-inside-avoid align-top">
                    <td className="py-1.5 pr-3 font-[560]">{r.title}</td>
                    <td
                      className={
                        r.status === 'fail'
                          ? 'py-1.5 pr-3 font-[650] text-[#b4183f]'
                          : r.status === 'pass'
                            ? 'py-1.5 pr-3 text-[#1f7a36]'
                            : 'py-1.5 pr-3 text-[#5b6178]'
                      }
                    >
                      {RESULT[r.status]}
                    </td>
                    <td className="py-1.5 text-[#30354d]">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.counterfactual.length > 0 && (
              <div className="mt-4">
                <p className="font-[650]">Se habría pagado solo si…</p>
                <ul className="mt-1 list-disc pl-5 text-[0.92rem]">
                  {d.counterfactual.map((c) => (
                    <li key={c}>{c}.</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-sm text-[#5b6178]">
              Política v{d.policyVersion}, motor {d.engineVersion}, decidido el{' '}
              {fmtDateTime(d.decidedAt)}.
              {invoice.mandate &&
                ` Acuerdo aplicado: ${describeMandate(invoice.mandate.terms)}, versión ${invoice.mandate.version}, firmado por ${invoice.mandate.signedBy.map((s) => s.name).join(' y ')}.`}
            </p>
          </Section>
        )}

        {people.length > 0 && (
          <Section title="Aprobación humana">
            <ul className="grid gap-1.5 text-[0.92rem]">
              {people.map((a) => (
                <li key={`${a.userId}-${a.at}`}>
                  <span className="font-[650]">{a.name}</span>{' '}
                  {a.action === 'approve' ? 'aprobó' : 'rechazó'} el {fmtDateTime(a.at)}
                  {a.via === 'link' ? ', desde el celular' : ''}
                  {a.note ? `: «${a.note}»` : '.'}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {invoice.payment && (
          <Section title="La transferencia">
            <Fields
              rows={[
                ['Riel', invoice.payment.railName],
                ['Monto', formatMoney(invoice.payment.amountMinor, invoice.payment.currency)],
                ['Destino registrado', invoice.payment.destination],
                ['Programada para', formatDate(invoice.payment.scheduledFor)],
                ['Salió', invoice.payment.sentAt ? fmtDateTime(invoice.payment.sentAt) : null],
                [
                  'Llegó',
                  invoice.payment.settledAt ? fmtDateTime(invoice.payment.settledAt) : null,
                ],
                ['Referencia', invoice.payment.reference],
              ]}
            />
          </Section>
        )}

        <Section title="Registro encadenado">
          <table className="w-full text-left text-[0.84rem]">
            <thead className="text-[#5b6178]">
              <tr>
                <th className="py-1 pr-3 font-[560]">Asiento</th>
                <th className="py-1 pr-3 font-[560]">Qué pasó</th>
                <th className="py-1 pr-3 font-[560]">Quién</th>
                <th className="py-1 pr-3 font-[560]">Cuándo</th>
                <th className="py-1 font-[560]">Huella</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e6e8f0]">
              {invoice.ledger.map((e) => (
                <tr key={e.seq} className="break-inside-avoid">
                  <td className="py-1.5 pr-3 tabular-nums">{e.seq}</td>
                  <td className="py-1.5 pr-3">{LEDGER_COPY[e.type] ?? e.type}</td>
                  <td className="py-1.5 pr-3">{e.actor.name}</td>
                  <td className="py-1.5 pr-3">{fmtDateTime(e.at)}</td>
                  <td className="py-1.5 font-mono text-[0.72rem] text-[#5b6178]">
                    {e.hash.slice(0, 20)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-[#5b6178]">
            Cada asiento guarda la huella SHA-256 del anterior. Si alguien cambia uno, todas las
            huellas siguientes dejan de cuadrar y el auditor independiente lo detecta.
          </p>
        </Section>
      </article>
    </div>
  );
}
