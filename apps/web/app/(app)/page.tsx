'use client';

import { BadgeCheck, ShieldCheck, ShieldX } from 'lucide-react';
import Link from 'next/link';
import { formatPeriod, formatPeriodMonth, formatUsd } from '@mandato/domain';
import { BudgetMeter, MonthMix, TrustLadder } from '@/components/charts';
import { Guilloche } from '@/components/guilloche';
import { InvoiceRows } from '@/components/invoice-list';
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
      <section className="max-w-3xl">
        <p className="mb-3 text-sm text-ink-3">{data.organization.legalName}</p>
        <h1 className="t-display text-ink">{headline(data)}</h1>
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
              className="sheet relative overflow-hidden p-5 hover:border-rule-strong"
              aria-label="Ver la auditoría"
            >
              <Guilloche
                size={220}
                bands={2}

                className="pointer-events-none absolute -top-16 -right-16 text-brand opacity-[0.16]"
              />
              {audit ? (
                <>
                  <p className="flex items-center gap-2 text-sm text-ink-2">
                    {audit.ok ? (
                      <ShieldCheck className="size-5 text-paid" aria-hidden />
                    ) : (
                      <ShieldX className="size-5 text-held" aria-hidden />
                    )}
                    Auditor independiente
                  </p>
                  <p className="t-display mt-3 text-ink">{audit.violations}</p>
                  <p className="text-[0.95rem] text-ink">pagos fuera de las reglas</p>
                  <p className="mt-3 text-sm text-ink-3">
                    {audit.paymentsChecked} pagos y {audit.decisionsChecked} decisiones revisadas,
                    cadena {audit.chainIntact ? 'íntegra' : 'rota'}.
                  </p>
                  <p className="mt-1 text-sm text-ink-3">Revisado el {fmtDateTime(audit.at)}</p>
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
                <p className="mt-4 text-sm text-ink-3">
                  Saldo disponible en la cuenta: {formatUsd(data.treasury.availableUsdCents)}
                </p>
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
