'use client';

import { useOverview } from '@/lib/api';
import { formatDateTime, formatMoney, formatPct } from '@/lib/format';
import { Reveal } from '@/components/proof-bar';
import { stagger } from '@/components/ui';

const muted = 'text-[color-mix(in_srgb,var(--paper)_72%,var(--ink))]';

/**
 * "Medido, no prometido": the scorecard of the running demo, or, before it ran, where the measured
 * numbers live. Nothing here is typed by hand.
 */
export function Measured() {
  const { data } = useOverview();
  const card =
    data && data.clock.phase !== 'idle' && data.scorecard.bills > 0 ? data.scorecard : null;

  return (
    <section id="medido" className="scroll-mt-6 bg-ink text-paper">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-4 py-20 sm:px-8 lg:py-28">
        <div className="grid max-w-[44rem] gap-4">
          <h2 className="t-h2">Medido, no prometido.</h2>
          <p className={`text-[1.0625rem] ${muted}`}>
            {card && data?.clock.now
              ? `Altamar Labs en la demo, al ${formatDateTime(data.clock.now)}: lo calcula el mismo marcador que usa la evaluación.`
              : 'Estos números salen de la demo en vivo, no de esta página. Corre la demo, o la evaluación sobre los casos etiquetados, y mira la tabla en docs/EVALUATION.md.'}
          </p>
        </div>

        {card ? (
          // the figures fade up once when seen; the numbers never count up
          <Reveal>
            <dl className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-6">
              <Figure
                i={0}
                className="lg:col-span-3"
                big
                value={formatPct(card.autonomyPct)}
                label={`de los casos decididos sin una persona (${card.decidedWithoutPerson} de ${card.bills})`}
              />
              <Figure
                i={1}
                className="lg:col-span-3"
                big
                value={String(card.improperPayments)}
                label="pagos indebidos, según un verificador independiente del motor"
              />
              <Figure
                i={2}
                className="lg:col-span-2"
                value={formatPct(card.evidenceCoveragePct)}
                label="del valor facturado tiene prueba de entrega"
              />
              <Figure
                i={3}
                className="lg:col-span-2"
                value={formatMoney(card.feesSavedUsdMinor, 'USD')}
                label="ahorrados en comisiones frente a una transferencia internacional"
              />
              <Figure
                i={4}
                className="lg:col-span-2"
                value={formatMoney(card.yieldKeptUsdMinor, 'USD')}
                label="de rendimiento por pagar el día del vencimiento, no antes"
              />
            </dl>
          </Reveal>
        ) : (
          <pre className="t-mono w-fit max-w-full overflow-x-auto rounded-[6px] border border-[color-mix(in_srgb,var(--paper)_24%,var(--ink))] px-4 py-3 text-[0.9375rem]">
            pnpm eval
          </pre>
        )}
      </div>
    </section>
  );
}

function Figure({
  i,
  value,
  label,
  big = false,
  className,
}: {
  i: number;
  value: string;
  label: string;
  big?: boolean;
  className?: string;
}) {
  return (
    <div
      style={stagger(i, 80)}
      className={`rise-in grid content-start gap-3 border-t border-[color-mix(in_srgb,var(--paper)_24%,var(--ink))] pt-5 ${className ?? ''}`}
    >
      <dt className={`order-2 max-w-[30ch] text-[0.9375rem] ${muted}`}>{label}</dt>
      <dd
        className={`t-figure order-1 ${big ? 'text-[clamp(3rem,2rem+4vw,5.5rem)]' : 'text-[clamp(1.75rem,1.4rem+1.4vw,2.5rem)]'}`}
      >
        {value}
      </dd>
    </div>
  );
}
