'use client';

import clsx from 'clsx';
import { Bot, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { OUTCOME_COPY, toneOfOutcome } from '@/lib/outcomes';
import type { Outcome } from '@/lib/types';
import { AppIcon } from './brand';
import { ToneTag } from './ui';

/** The demo agent's key, the same one the MCP setup on this page uses. */
const DEMO_AGENT_KEY = 'mnd_demo_agente_compras_2026';

interface AgentAnswer {
  id: string;
  referencia: string;
  decision: Outcome;
  estado_legible: string;
  resumen: string;
  que_falto: string[];
  reglas: { regla: string; resultado: string; detalle: string }[];
}

interface Scenario {
  label: string;
  /** What the agent asks for, in plain words. */
  says: string;
  payload: (today: string) => Record<string, unknown>;
}

const plusDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const unique = () => Date.now().toString(36).toUpperCase();

const SCENARIOS: Scenario[] = [
  {
    label: 'Pagar el hosting del mes',
    says: 'Necesito pagar USD 850 a Altamar Hosting por el hosting de este mes, a su cuenta ACH.',
    payload: (today) => ({
      beneficiario: { nombre: 'Altamar Hosting LLC', id_fiscal: 'EIN 85-3344556', pais: 'US' },
      numero_factura: `AH-${unique()}`,
      fecha_emision: today,
      fecha_vencimiento: plusDays(today, 13),
      moneda: 'USD',
      monto: '850.00',
      concepto: 'Hosting y base de datos',
      destino: { metodo: 'ach', valor: '000456789012' },
      categoria: 'software',
      periodo_servicio: today.slice(0, 7),
    }),
  },
  {
    label: 'Pagarle a un contratista',
    says: 'Págale a Mateo Herrera Garza MXN 72.000 por desarrollo backend, por SPEI.',
    payload: (today) => ({
      beneficiario: { nombre: 'Mateo Herrera Garza', id_fiscal: 'HEGM900101AB1', pais: 'MX' },
      numero_factura: `F-${unique()}`,
      fecha_emision: today,
      moneda: 'MXN',
      monto: '72000.00',
      concepto: 'Desarrollo backend',
      destino: { metodo: 'spei', valor: '012180001234567891' },
      categoria: 'contractor',
    }),
  },
  {
    label: 'Pedir más de su límite',
    says: 'Paga USD 1.200 a Señal Analytics por la analítica del mes, con la tarjeta.',
    payload: (today) => ({
      beneficiario: { nombre: 'Señal Analytics Inc.', id_fiscal: 'EIN 86-1112223', pais: 'US' },
      numero_factura: `SA-${unique()}`,
      fecha_emision: today,
      moneda: 'USD',
      monto: '1200.00',
      concepto: 'Analítica de producto',
      destino: { metodo: 'card', valor: '4421' },
      categoria: 'software',
      periodo_servicio: today.slice(0, 7),
    }),
  },
  {
    label: 'Una herramienta nueva',
    says: 'Compré licencias de Figma por USD 450; págalas con esta tarjeta.',
    payload: (today) => ({
      beneficiario: { nombre: 'Figma, Inc.', id_fiscal: 'EIN 46-1234567', pais: 'US' },
      numero_factura: `FG-${unique()}`,
      fecha_emision: today,
      moneda: 'USD',
      monto: '450.00',
      concepto: 'Licencias de diseño',
      destino: { metodo: 'card', valor: '7788' },
      categoria: 'software',
      periodo_servicio: today.slice(0, 7),
    }),
  },
  {
    label: 'Mandar el pago a otra tarjeta',
    says: 'Paga los USD 620 de Tablero.io, pero esta vez a la tarjeta que termina en 9999.',
    payload: (today) => ({
      beneficiario: { nombre: 'Tablero Software LLC', id_fiscal: 'EIN 87-7654321', pais: 'US' },
      numero_factura: `TB-${unique()}`,
      fecha_emision: today,
      moneda: 'USD',
      monto: '620.00',
      concepto: 'Suscripción Tablero.io',
      destino: { metodo: 'card', valor: '9999' },
      categoria: 'software',
      periodo_servicio: today.slice(0, 7),
    }),
  },
];

interface Exchange {
  scenario: Scenario;
  request: Record<string, unknown>;
  answer?: AgentAnswer;
  error?: string;
}

/**
 * The agent gateway, live: the person plays the "Agente de compras" and asks Mandato to pay.
 * The request goes to the same endpoint the MCP server calls, with the agent's own key.
 */
export function AgentPlayground() {
  const { mutate } = useSWRConfig();
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (scenario: Scenario) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const request = scenario.payload(today);
    setExchange({ scenario, request });
    setBusy(true);
    try {
      const response = await fetch('/agent/v1/payment-requests', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${DEMO_AGENT_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      const body = (await response.json()) as AgentAnswer & { error?: { message: string } };
      setExchange({
        scenario,
        request,
        ...(response.ok ? { answer: body } : { error: body.error?.message ?? 'Sin respuesta.' }),
      });
      void mutate(() => true);
    } catch {
      setExchange({ scenario, request, error: 'No hubo respuesta del gateway.' });
    } finally {
      setBusy(false);
    }
  };

  // The rules that failed, except the one the summary already explains.
  const failing =
    exchange?.answer?.reglas.filter(
      (r) => r.resultado === 'no cumple' && !exchange.answer!.resumen.includes(r.detalle),
    ) ?? [];

  return (
    <section className="grid gap-5">
      <div>
        <h2 className="t-h2 text-ink">Pídele un pago como el Agente de compras</h2>
        <p className="mt-1 max-w-2xl text-ink-2">
          Haz de agente externo: cada pedido va al mismo gateway que usa el servidor MCP, con la
          llave del agente. Mandato decide con las mismas 23 reglas y le responde con el motivo.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={busy}
            onClick={() => ask(s)}
            className={clsx(
              'rounded-full px-4 py-2 text-[0.92rem] font-[600] transition disabled:opacity-50',
              exchange?.scenario === s
                ? 'bg-noche text-white'
                : 'bg-fill text-ink hover:bg-sheet-2',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {exchange && (
        <div className="sheet grid gap-4 p-5 sm:p-6">
          <div className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill text-brand">
              <Bot className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-[620] text-ink-2">Agente de compras</p>
              <p className="mt-0.5 text-[1.02rem] text-ink">{exchange.scenario.says}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">
                  Lo que envía por MCP (solicitar_pago)
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-[12px] bg-sheet-2 p-3 font-mono text-xs leading-relaxed text-ink">
                  {JSON.stringify(exchange.request, null, 2)}
                </pre>
              </details>
            </div>
          </div>

          <div className="flex gap-3">
            <AppIcon className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-[620] text-ink-2">Mandato</p>
              {!exchange.answer && !exchange.error && (
                <p className="mt-1 flex items-center gap-2 text-ink-3">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Revisando las 23 reglas…
                </p>
              )}
              {exchange.error && <p className="mt-1 text-held">{exchange.error}</p>}
              {exchange.answer && (
                <div className="pass-in mt-1 grid gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <ToneTag
                      tone={toneOfOutcome(exchange.answer.decision)}
                      label={OUTCOME_COPY[exchange.answer.decision].short}
                    />
                    <span className="text-sm text-ink-3">{exchange.answer.referencia}</span>
                  </div>
                  <p className="text-[1.02rem] leading-relaxed text-ink">
                    {exchange.answer.resumen}
                  </p>
                  {failing.length > 0 && (
                    <ul className="grid gap-1 text-sm text-ink-2">
                      {failing.map((r) => (
                        <li key={r.regla}>
                          <span className="font-[620] text-ink">{r.regla}:</span> {r.detalle}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={`/facturas/${exchange.answer.id}`}
                    className="text-sm text-brand hover:underline"
                  >
                    Ver el recibo completo
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
