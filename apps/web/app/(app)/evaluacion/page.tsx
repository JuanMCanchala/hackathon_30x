'use client';

import clsx from 'clsx';
import { Check, Play, ShieldCheck, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { formatPercent } from '@mandato/domain';
import { Button, PageHeader, Skeleton, ToneTag, fmtDateTime } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { OUTCOME_COPY, toneOfOutcome } from '@/lib/outcomes';
import type { EvaluationBill, EvaluationReport, EvaluationRun, InvoiceListItem } from '@/lib/types';

const GROUPS = ['Agosto', 'Septiembre', 'En vivo', 'Ataques'] as const;

const seconds = (ms: number) =>
  (ms / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const GROUP_NOTE: Record<(typeof GROUPS)[number], string> = {
  Agosto: 'El primer mes, con los acuerdos iniciales.',
  Septiembre: 'Los mismos proveedores, con los acuerdos firmados en agosto.',
  'En vivo': 'Archivos de octubre, con el reloj real.',
  Ataques: 'Once intentos de sacarle un pago indebido.',
};

function Outcome({ outcome }: { outcome: EvaluationBill['actual'] }) {
  if (!outcome) return <span className="text-sm text-ink-3">sin decisión</span>;
  return <ToneTag tone={toneOfOutcome(outcome)} label={OUTCOME_COPY[outcome].short} />;
}

/** One of the three criteria the challenge is judged on, with its number and its proof. */
function Criterion({
  name,
  figure,
  unit,
  children,
  highlight,
}: {
  name: string;
  figure: string;
  unit: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section
      className={clsx(
        'grid content-start gap-3 rounded-[22px] p-6',
        highlight ? 'bg-marker text-on-marker' : 'sheet',
      )}
    >
      <p className="font-display text-[1.05rem] font-[680]">{name}</p>
      <p className="t-figure text-[3.6rem] leading-none">{figure}</p>
      <p className="font-display -mt-1 text-[1.02rem] font-[620]">{unit}</p>
      <div className={clsx('grid gap-1.5 text-[0.93rem]', highlight ? 'opacity-85' : 'text-ink-2')}>
        {children}
      </div>
    </section>
  );
}

function AutonomyBars({ report }: { report: EvaluationReport }) {
  return (
    <ul className="mt-1 grid gap-2">
      {report.groups.map((g) => (
        <li key={g.group} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2.5">
          <span className="text-sm text-ink-2">{g.group}</span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-fill">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand/25"
              style={{ width: `${g.autonomyCeiling * 100}%` }}
              aria-hidden
            />
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand"
              style={{ width: `${g.correctAutonomy * 100}%` }}
              aria-hidden
            />
          </span>
          <span className="text-right text-sm text-ink tabular-nums">
            {formatPercent(g.correctAutonomy)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BillRow({ bill, receipt }: { bill: EvaluationBill; receipt?: string }) {
  return (
    <li className="grid gap-x-5 gap-y-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 font-[620] text-ink">
          {bill.title}
          <span className="font-mono text-[0.72rem] font-[500] text-ink-3">{bill.id}</span>
        </p>
        {bill.trap && <p className="mt-0.5 text-sm text-ink-3">Trampa: {bill.trap}</p>}
        {bill.summary && (
          <p className="mt-1.5 line-clamp-2 text-[0.93rem] leading-snug text-ink-2">
            {bill.summary}
          </p>
        )}
        {receipt && (
          <Link
            href={`/facturas/${receipt}`}
            className="mt-1 inline-block text-sm text-brand hover:underline"
          >
            Ver su recibo en la demo
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <span className="text-xs text-ink-3">esperado</span>
        <Outcome outcome={bill.expected} />
        <span className="text-xs text-ink-3">decidió</span>
        <Outcome outcome={bill.actual} />
        {bill.correct ? (
          <Check className="size-5 text-paid" strokeWidth={3} aria-label="Correcta" />
        ) : (
          <X className="size-5 text-held" strokeWidth={3} aria-label="Distinta a la esperada" />
        )}
      </div>
    </li>
  );
}

export default function EvaluacionPage() {
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useApi<EvaluationRun>('/api/v1/evaluation');
  const { data: live } = useApi<InvoiceListItem[]>('/api/v1/invoices?limit=500');
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const result = await post<EvaluationRun>('/api/v1/evaluation/run');
      const r = result.endToEnd ?? result.engine;
      toast(`${r.totals.correct} de ${r.totals.total} decisiones correctas`, {
        description: `${r.totals.unsafe} pagos indebidos, en ${seconds(result.durationMs)} s.`,
      });
      void mutate((key) => Array.isArray(key) && key[0] === '/api/v1/evaluation', result, {
        revalidate: false,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo correr la evaluación.');
    } finally {
      setRunning(false);
    }
  };

  const receipts = new Map(
    (live ?? []).filter((i) => i.datasetId).map((i) => [i.datasetId!, i.id] as const),
  );

  if (isLoading || !data) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title="Evaluación"
          lead="Corriendo las 49 facturas del set en una base de datos aparte. Tarda unos segundos."
        />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const report = data.endToEnd ?? data.engine;
  const t = report.totals;
  const example = report.bills.find((b) => b.id === 'sep-12') ?? report.bills[0];

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Evaluación"
        lead="Lo que mide el reto, medido aquí mismo: el agente decide las 49 facturas del set en una base de datos aparte, y cada decisión se compara con la que debía tomar. Tu demo no cambia."
        actions={
          <Button
            variant="primary"
            icon={<Play className="size-4" aria-hidden />}
            onClick={run}
            loading={running}
          >
            Correr otra vez
          </Button>
        }
      />

      <section className="noche relative overflow-hidden rounded-[30px] px-7 py-9 sm:px-10">
        <p className="font-hand -rotate-1 text-[1.6rem] leading-none text-marker">
          así nos mide el reto
        </p>
        <h2 className="font-display mt-3 max-w-4xl text-[clamp(1.8rem,1.2rem+2.2vw,2.8rem)] leading-[1.04] font-[780] tracking-[-0.035em] text-white">
          {t.correct} de {t.total} decisiones correctas, {t.unsafe === 0 ? 'cero' : t.unsafe} pagos
          fuera de las reglas y {report.bills.filter((b) => b.explained).length} recibos que lo
          explican.
        </h2>
        <p className="mt-4 text-[0.95rem] text-white/70">
          Corrida del {fmtDateTime(data.ranAt)}, en {seconds(data.durationMs)} s, con{' '}
          {data.endToEnd
            ? 'las lecturas grabadas de cada documento'
            : 'una lectura perfecta (faltan lecturas grabadas)'}
          . La misma evaluación corre con cada cambio del código y lo bloquea si algo falla.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Criterion
          name="Autonomía"
          figure={formatPercent(t.correctAutonomy)}
          unit="de las facturas, decididas bien sin una persona"
        >
          <AutonomyBars report={report} />
          <p className="mt-2 text-sm text-ink-3">
            La barra clara es el techo: el resto son trampas que deben llegar a una persona. El
            agente lo alcanza en cada grupo, y sube con cada acuerdo firmado.
          </p>
        </Criterion>
        <Criterion
          name="Seguridad"
          figure={String(t.unsafe)}
          unit="pagos aprobados fuera de las reglas"
          highlight={t.unsafe === 0}
        >
          <p className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            {report.attacks.caught} de {report.attacks.total} ataques atrapados.
          </p>
          <p>
            El auditor, escrito aparte del motor, revisó {report.audit.paymentsChecked} pagos y{' '}
            {report.audit.decisionsChecked} decisiones:{' '}
            {report.audit.ok ? '0 violaciones' : `${report.audit.violations} violaciones`}, cadena{' '}
            {report.audit.chainIntact ? 'íntegra' : 'rota'}.
          </p>
        </Criterion>
        <Criterion
          name="Explicabilidad"
          figure={`${report.bills.filter((b) => b.explained).length}/${report.bills.length}`}
          unit="decisiones con su recibo"
        >
          <p>
            Cada una con el motivo en palabras, las 23 reglas revisadas y lo que habría faltado para
            pagarla.
          </p>
          {report.extraction && (
            <p>
              Lectura de documentos: {report.extraction.correct} de {report.extraction.fields}{' '}
              campos críticos ({formatPercent(report.extraction.accuracy)}).
            </p>
          )}
          {example && receipts.get(example.id) && (
            <Link
              href={`/facturas/${receipts.get(example.id)}`}
              className="text-brand hover:underline"
            >
              Ver un recibo
            </Link>
          )}
        </Criterion>
      </div>

      <section className="grid gap-6">
        <div>
          <h2 className="t-h2 text-ink">Factura por factura</h2>
          <p className="mt-1 max-w-2xl text-ink-2">
            Lo que el set de datos dice que debía decidir el agente, y lo que decidió. Las facturas
            que ya procesaste en la demo enlazan a su recibo.
          </p>
        </div>
        {GROUPS.map((group) => {
          const bills = report.bills.filter((b) => b.group === group);
          const metrics = report.groups.find((g) => g.group === group);
          if (!bills.length || !metrics) return null;
          return (
            <div key={group} className="grid gap-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
                <p className="font-display text-[1.1rem] font-[680] text-ink">
                  {group}{' '}
                  <span className="font-sans text-sm font-[450] text-ink-3">
                    {GROUP_NOTE[group]}
                  </span>
                </p>
                <p className="text-sm text-ink-2 tabular-nums">
                  {metrics.correct} de {metrics.total} correctas, autonomía{' '}
                  {formatPercent(metrics.correctAutonomy)}
                </p>
              </div>
              <ul className="sheet divide-y divide-rule overflow-hidden">
                {bills.map((bill) => (
                  <BillRow key={bill.id} bill={bill} receipt={receipts.get(bill.id)} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
