'use client';

import { Mono, PageHeader } from '@/components/ui';
import { useVendors } from '@/lib/api';
import { formatMoney, RAIL_LABEL } from '@/lib/format';
import type { Currency } from '@/lib/types';

const COUNTRY: Record<string, string> = {
  CO: 'Colombia',
  MX: 'México',
  BR: 'Brasil',
  US: 'Estados Unidos',
};

const CONTRACT_TYPE: Record<string, string> = {
  hourly: 'Por horas',
  milestone: 'Por hitos',
  retainer: 'Cuota fija',
  usage: 'Por uso',
  goods: 'Bienes',
};

export default function VendorsPage() {
  const { data, error } = useVendors();
  return (
    <>
      <PageHeader
        title="Proveedores"
        lead="Los contratistas de Altamar, su destino de pago registrado (enmascarado) y la regla que prueba que entregaron."
      />
      {error && !data ? (
        <p className="sheet p-6 text-ink-2">No pudimos leer los proveedores: {error.message}</p>
      ) : !data ? (
        <div className="sheet h-96" aria-busy aria-label="Cargando los proveedores" />
      ) : data.length === 0 ? (
        <p className="sheet p-6 text-ink-2">No hay proveedores. Reinicia la demo.</p>
      ) : (
        <ul className="sheet divide-y divide-rule">
          {data.map((v) => (
            <li
              key={v.id}
              className="grid gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-8"
            >
              <div className="grid content-start gap-1">
                <p className="font-[750]">{v.name}</p>
                <p className="text-[0.875rem] text-ink-3">
                  {v.legalName} · {COUNTRY[v.country] ?? v.country}
                </p>
                <p className="mt-2 text-[0.875rem]">
                  <span className="text-ink-3">Paga por </span>
                  <span className="font-[650]">{RAIL_LABEL[v.payout.rail] ?? v.payout.rail}</span>
                  <span className="text-ink-3"> en </span>
                  <Mono>{v.payout.currency}</Mono>
                </p>
                <Mono className="text-[0.8125rem] text-ink-2">{v.payout.display}</Mono>
                <p className="mt-2 text-[0.8125rem] text-ink-3">
                  <Mono>{v.bills}</Mono> {v.bills === 1 ? 'cuenta' : 'cuentas'}
                  {Object.entries(v.paid).map(([cur, minor]) => (
                    <span key={cur}>
                      {' · pagado '}
                      <Mono>{formatMoney(minor, cur as Currency)}</Mono>
                    </span>
                  ))}
                </p>
              </div>
              <ul className="grid gap-4">
                {v.contracts.map((c) => (
                  <li key={c.id} className="grid gap-1.5">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-[650]">{c.title}</span>
                      <span className="rounded-[6px] bg-fill px-2 py-0.5 text-[0.8125rem] font-[650] text-ink-2">
                        {CONTRACT_TYPE[c.type] ?? c.type}
                      </span>
                    </p>
                    <p className="text-[0.9375rem] text-ink-2">{c.evidenceRuleText}</p>
                    <dl className="t-mono flex flex-wrap gap-x-6 gap-y-1 text-[0.8125rem] text-ink-2">
                      <div className="flex gap-1.5">
                        <dt className="font-sans text-ink-3">Tope mensual</dt>
                        <dd>{formatMoney(c.periodCapMinor, c.currency)}</dd>
                      </div>
                      {c.terms.map((t) => (
                        <div key={t.id} className="flex gap-1.5">
                          <dt className="font-sans text-ink-3">{t.title}</dt>
                          <dd>{formatMoney(t.unitPriceMinor, c.currency)}</dd>
                        </div>
                      ))}
                      <div className="flex gap-1.5">
                        <dt className="font-sans text-ink-3">Plazo</dt>
                        <dd>{c.netDays} días</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
