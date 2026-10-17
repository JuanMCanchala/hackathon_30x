'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { OUTCOME_INK, OutcomeStamp } from '@/components/outcome';
import { ButtonLink, Mono, PageHeader } from '@/components/ui';
import { useBills, useOverview } from '@/lib/api';
import { formatDateTime, formatMoney, formatPct, OUTCOMES } from '@/lib/format';
import { useFresh } from '@/lib/motion';

function hoursPhrase(h: number | null): string {
  if (h === null) return '—';
  if (h < 48) return `${h.toLocaleString('es-CO')} h`;
  return `${(Math.round((h / 24) * 10) / 10).toLocaleString('es-CO')} días`;
}

export default function OverviewPage() {
  const { data, error } = useOverview();
  // new activity slides in while the tour runs; what was there on load stays still
  const fresh = useFresh(data?.timeline.slice(0, 12).map((t) => t.seq) ?? [], !!data);
  const { data: bills } = useBills();

  if (error && !data)
    return (
      <>
        <PageHeader title="Resumen" />
        <p className="sheet p-6 text-ink-2">
          No pudimos leer el resumen: {error.message} Revisa que la API esté corriendo.
        </p>
      </>
    );
  if (!data) return <div className="sheet h-96" aria-busy aria-label="Cargando el resumen" />;

  const s = data.scorecard;
  const cases = bills?.filter((b) => b.status !== 'SUPERSEDED') ?? [];
  const byOutcome = OUTCOMES.map((o) => ({ o, n: cases.filter((b) => b.outcome === o).length }));
  const max = Math.max(1, ...byOutcome.map((x) => x.n));

  const figures: { label: string; value: string; note: string }[] = [
    {
      label: 'Resueltas por el proveedor',
      value: String(s.vendorResolved),
      note: 'Casos que se cerraron sin una persona después de que el proveedor respondió.',
    },
    {
      label: 'Cobertura de evidencia',
      value: formatPct(s.evidenceCoveragePct),
      note: 'Parte del valor facturado (en USD) que la evidencia prueba.',
    },
    {
      label: 'Rendimiento conservado',
      value: formatMoney(s.yieldKeptUsdMinor, 'USD'),
      note: 'Lo que el dinero rinde hasta la fecha de pago, en vez de pagar el día que llega.',
    },
    {
      label: 'Comisiones ahorradas',
      value: formatMoney(s.feesSavedUsdMinor, 'USD'),
      note: 'Riel local (Bre-B, SPEI, Pix, ACH) frente a una transferencia internacional.',
    },
    {
      label: 'Tiempo a pago',
      value: hoursPhrase(s.medianHoursToPayment),
      note: 'Mediana desde que llega la cuenta hasta su pago (enviado o programado).',
    },
  ];

  return (
    <>
      <PageHeader
        title="Resumen"
        lead="El marcador de Altamar Labs: cuántas cuentas decidió Recibido sin una persona, cuánto probó la evidencia y qué sigue abierto."
        actions={
          <ButtonLink href="/recorrido" variant="secondary">
            Ir al recorrido
          </ButtonLink>
        }
      />

      {s.bills === 0 ? (
        <p className="sheet p-6 text-ink-2">
          Todavía no hay cuentas. Reinicia la demo desde el{' '}
          <Link href="/recorrido" className="text-ink underline">
            recorrido
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-10">
          <section aria-label="Marcador" className="grid gap-4 lg:grid-cols-2">
            <div className="sheet grid content-between gap-6 p-5 sm:p-6">
              <p className="text-[0.9375rem] font-[650] text-ink-2">Autonomía</p>
              <p className="t-figure text-[clamp(3.5rem,2.5rem+3vw,5.5rem)] text-ink">
                {formatPct(s.autonomyPct)}
              </p>
              <p className="text-ink-2">
                <Mono className="text-ink">
                  {s.decidedWithoutPerson} de {s.bills}
                </Mono>{' '}
                casos se decidieron sin una persona. Hoy, sin Recibido, todos pasan por alguien.
              </p>
            </div>
            <div className="sheet grid content-between gap-6 p-5 sm:p-6">
              <p className="text-[0.9375rem] font-[650] text-ink-2">Pagos indebidos</p>
              <p
                className={clsx(
                  't-figure text-[clamp(3.5rem,2.5rem+3vw,5.5rem)]',
                  s.improperPayments === 0 ? 'text-pay' : 'text-escalate',
                )}
              >
                {s.improperPayments}
              </p>
              <p className="text-ink-2">
                Contados por un verificador independiente del motor: nada sobre el tope o la tarifa,
                nada sin probar, nada a otro destino, nada pagado dos veces.
              </p>
            </div>
          </section>

          {data.violations.length > 0 && (
            <section role="alert" className="sheet grid gap-2 p-5 text-escalate">
              <h2 className="t-h3">El verificador encontró problemas</h2>
              <ul className="list-disc pl-5">
                {data.violations.map((v) => (
                  <li key={`${v.invariant}:${v.billId}:${v.paymentId}`}>
                    <Mono>{v.invariant}</Mono> · {v.detail}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Más cifras" className="sheet divide-y divide-rule">
            {figures.map((f) => (
              <div
                key={f.label}
                className="grid gap-1 px-5 py-4 sm:grid-cols-[14rem_12rem_minmax(0,1fr)] sm:items-baseline sm:gap-6 sm:px-6"
              >
                <span className="font-[700]">{f.label}</span>
                <Mono className="text-[1.25rem] font-[650]">{f.value}</Mono>
                <span className="text-[0.875rem] text-ink-2">{f.note}</span>
              </div>
            ))}
          </section>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
            <section className="grid content-start gap-3">
              <h2 className="t-h3">Decisiones</h2>
              <ul className="sheet divide-y divide-rule">
                {byOutcome.map(({ o, n }) => (
                  <li key={o}>
                    <Link
                      href="/cuentas"
                      className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-fill"
                    >
                      <OutcomeStamp outcome={o} size="sm" className="w-fit" />
                      <Mono className="text-right text-[1.125rem] font-[650]">{n}</Mono>
                      <span className="col-span-2 block h-1.5 rounded-[2px] bg-fill">
                        <span
                          className={clsx('block h-full rounded-[2px] bg-current', OUTCOME_INK[o])}
                          style={{ width: `${(n / max) * 100}%` }}
                        />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-[0.8125rem] text-ink-3">
                Decisión vigente de cada caso; las correcciones cuentan una vez.
              </p>
            </section>

            <section className="grid content-start gap-3">
              <h2 className="t-h3">Actividad reciente</h2>
              <ol className="sheet divide-y divide-rule">
                {data.timeline.slice(0, 12).map((t) => (
                  <li
                    key={t.seq}
                    className={clsx(
                      fresh(t.seq) && 'rise-in',
                      'grid gap-x-4 gap-y-0.5 px-5 py-3 text-[0.9375rem] sm:grid-cols-[8rem_minmax(0,1fr)]',
                    )}
                  >
                    <Mono className="text-[0.8125rem] text-ink-3">{formatDateTime(t.at)}</Mono>
                    {t.billId ? (
                      <Link href={`/cuentas/${t.billId}`} className="text-ink hover:underline">
                        {t.text}
                      </Link>
                    ) : (
                      <span className="text-ink">{t.text}</span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
