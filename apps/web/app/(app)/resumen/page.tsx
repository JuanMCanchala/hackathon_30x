'use client';

import { BadgeCheck, ShieldCheck, ShieldX } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { formatPeriod, formatPeriodMonth, formatUsd } from '@mandato/domain';
import { BudgetMeter, MonthMix, TrustLadder } from '@/components/charts';
import { Floating, Pen, Spark } from '@/components/landing/doodles';
import { InvoiceRows } from '@/components/invoice-list';
import { RadarCard } from '@/components/radar';
import { Button, Empty, Skeleton, fmtDateTime } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { Overview } from '@/lib/types';

function headline(o: Overview): string {
  const closed = o.ladder.filter((s) => !s.inProgress);
  const open = o.ladder.find((s) => s.inProgress);
  const alone = (s: Overview['ladder'][number]) => s.paidByAgent + s.heldByAgent;
  const safe = o.latestAudit?.ok ? ', sin un solo pago fuera de lo firmado' : '';
  const last = closed.at(-1);
  const first = closed[0];
  if (last && first && last !== first) {
    return `En ${formatPeriodMonth(last.periodKey)} el agente decidió solo ${alone(last)} de ${last.total} cobros. En ${formatPeriodMonth(first.periodKey)} fueron ${alone(first)} de ${first.total}${safe}.`;
  }
  if (last) {
    return `En ${formatPeriodMonth(last.periodKey)} el agente decidió solo ${alone(last)} de ${last.total} cobros${safe}.`;
  }
  if (open) {
    return `En lo que va de ${formatPeriodMonth(open.periodKey)}, el agente decidió solo ${alone(open)} de ${open.total} cobros${safe}.`;
  }
  return 'Todavía no hay cobros. Empieza el recorrido guiado o sube una factura.';
}

export default function ResumenPage() {
  const { data, isLoading } = useApi<Overview>('/api/v1/overview');

  if (isLoading || !data) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const current = data.periods.find((p) => p.periodKey === data.currentPeriod);
  const latest = data.periods.at(-1);
  const budgetPeriod = current ?? latest;
  const audit = data.latestAudit;

  return (
    <div className="grid gap-10">
      <section className="noche relative overflow-hidden rounded-[30px] px-7 py-9 sm:px-10 sm:py-11">
        <Floating className="top-6 right-8 hidden w-14 text-marker/80 sm:block" tilt={-10}>
          <Pen />
        </Floating>
        <Floating className="right-[22%] bottom-6 hidden w-10 text-marker/70 md:block" delay={900}>
          <Spark />
        </Floating>
        <p className="font-hand -rotate-1 text-[1.6rem] leading-none text-marker">
          {data.organization.legalName}, en números
        </p>
        <h1 className="font-display mt-3 max-w-4xl text-[clamp(1.9rem,1.2rem+2.4vw,3rem)] leading-[1.02] font-[780] tracking-[-0.035em] text-white">
          {headline(data)}
        </h1>
      </section>

      {data.ladder.length === 0 ? (
        <Empty
          title="Aún no hay decisiones"
          action={
            <Link href="/recorrido">
              <Button variant="primary">Empezar el recorrido guiado</Button>
            </Link>
          }
        >
          El recorrido procesa agosto y septiembre de Andes Labs, una empresa ficticia, con las
          decisiones de su equipo. Así se ve cómo el agente gana autonomía sin salirse de lo
          firmado.
        </Empty>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="sheet p-5 sm:p-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="t-h3 text-ink">Escalera de confianza</h2>
              <p className="text-sm text-ink-3">
                Cobros decididos sin intervención humana, por mes
              </p>
            </div>
            <TrustLadder steps={data.ladder} />
            <div className="mt-5 border-t border-rule pt-5">
              <p className="mb-3 text-sm font-[620] text-ink">Cómo decidió cada mes</p>
              <MonthMix steps={data.ladder} />
            </div>
            <p className="mt-3 max-w-2xl text-[0.95rem] text-ink-2">
              Cada aprobación enseña: el agente propone un acuerdo y una persona lo firma o lo
              rechaza. Con cada acuerdo firmado sube un escalón, pero nunca paga fuera de lo
              firmado.
            </p>
          </div>

          <div className="grid content-start gap-6">
            <Link
              href="/auditoria"
              className={clsx(
                'lift relative overflow-hidden rounded-[22px] p-6',
                audit?.ok ? 'bg-marker text-on-marker' : 'sheet',
              )}
              aria-label="Ver la auditoría"
            >
              {audit ? (
                <>
                  <p className="font-display flex items-center gap-2 text-[0.95rem] font-[620]">
                    {audit.ok ? (
                      <ShieldCheck className="size-5" aria-hidden />
                    ) : (
                      <ShieldX className="size-5 text-held" aria-hidden />
                    )}
                    Auditor independiente
                  </p>
                  <p className="t-figure mt-2 text-[4.5rem] leading-none">{audit.violations}</p>
                  <p className="font-display text-[1.05rem] font-[650]">
                    pagos fuera de las reglas
                  </p>
                  <p className="mt-3 text-sm opacity-80">
                    {audit.paymentsChecked} pagos y {audit.decisionsChecked} decisiones revisadas,
                    cadena {audit.chainIntact ? 'íntegra' : 'rota'}.
                  </p>
                  <p className="mt-1 text-sm opacity-80">Revisado el {fmtDateTime(audit.at)}</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm text-ink-2">
                    <BadgeCheck className="size-5 text-ink-3" aria-hidden /> Auditor independiente
                  </p>
                  <p className="mt-3 text-[0.95rem] text-ink">Aún no ha revisado el registro.</p>
                  <p className="mt-1 text-sm text-brand">Correr la auditoría</p>
                </>
              )}
            </Link>

            {budgetPeriod && (
              <div className="sheet p-5">
                <p className="text-sm text-ink-2">
                  Presupuesto de {formatPeriod(budgetPeriod.periodKey)}
                </p>
                <div className="mt-3">
                  <BudgetMeter
                    committed={budgetPeriod.committedUsdCents}
                    budget={budgetPeriod.budgetUsdCents}
                  />
                </div>
                <Link
                  href="/pagos"
                  className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-rule pt-3 text-sm hover:text-brand"
                >
                  <span className="text-ink-2">En la cuenta hoy</span>
                  <span className="text-right text-ink tabular-nums">
                    {formatUsd(data.treasury.balanceUsdCents)}
                  </span>
                  <span className="text-ink-2">Libre para nuevos pagos</span>
                  <span className="text-right font-[600] text-ink tabular-nums">
                    {formatUsd(data.treasury.availableUsdCents)}
                  </span>
                </Link>
              </div>
            )}

            {(data.pendingApprovals > 0 || data.pendingProposals > 0) && (
              <div className="sheet grid gap-3 p-5">
                {data.pendingApprovals > 0 && (
                  <Link
                    href="/aprobaciones"
                    className="flex items-center justify-between gap-3 hover:text-brand"
                  >
                    <span className="text-[0.95rem] text-ink">Cobros esperando aprobación</span>
                    <span className="t-figure text-xl text-ink">{data.pendingApprovals}</span>
                  </Link>
                )}
                {data.pendingProposals > 0 && (
                  <Link
                    href="/acuerdos"
                    className="flex items-center justify-between gap-3 hover:text-brand"
                  >
                    <span className="text-[0.95rem] text-ink">
                      Acuerdos propuestos por el agente
                    </span>
                    <span className="t-figure text-xl text-ink">{data.pendingProposals}</span>
                  </Link>
                )}
              </div>
            )}
            <RadarCard />
          </div>
        </section>
      )}

      {data.recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="t-h3 text-ink">Últimas decisiones</h2>
            <Link href="/facturas" className="text-sm text-brand hover:underline">
              Ver todas las facturas
            </Link>
          </div>
          <div className="sheet overflow-hidden">
            <InvoiceRows items={data.recent} />
          </div>
        </section>
      )}
    </div>
  );
}
