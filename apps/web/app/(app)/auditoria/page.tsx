'use client';

import clsx from 'clsx';
import { Check, Download, ShieldCheck, ShieldX, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { LEDGER_COPY } from '@/components/receipt/ledger-trail';
import { Button, PageHeader, Skeleton, fmtDateTime } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { AuditRun, LedgerRow } from '@/lib/types';

export default function AuditoriaPage() {
  const { mutate } = useSWRConfig();
  const { data: audit, isLoading } = useApi<AuditRun | null>('/api/v1/audit/latest');
  const { data: ledger } = useApi<LedgerRow[]>('/api/v1/ledger?limit=60');
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const result = await post<AuditRun>('/api/v1/audit');
      toast(result.report.ok ? 'Auditoría limpia' : 'La auditoría encontró problemas', {
        description: `${result.report.paymentsChecked} pagos revisados, ${result.report.findings.length} violaciones.`,
      });
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo correr la auditoría.');
    } finally {
      setRunning(false);
    }
  };

  const report = audit?.report;

  return (
    <div className="grid grid-cols-1 gap-10">
      <PageHeader
        title="Auditoría"
        lead="Un auditor escrito aparte del motor relee el registro completo, rehace las cuentas y verifica cada pago contra nueve invariantes. No confía en lo que dijo el motor."
        actions={
          <>
            <a
              href="/api/v1/reconciliation.csv"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-fill px-4 text-[0.94rem] font-[560] text-ink hover:bg-sheet-2"
            >
              <Download className="size-4" aria-hidden /> Conciliación (CSV)
            </a>
            <a
              href="/api/v1/ledger/export.json"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-fill px-4 text-[0.94rem] font-[560] text-ink hover:bg-sheet-2"
            >
              <Download className="size-4" aria-hidden /> Registro (JSON)
            </a>
            <Button variant="primary" onClick={run} loading={running}>
              Correr la auditoría
            </Button>
          </>
        }
      />

      {isLoading && audit === undefined ? (
        <Skeleton className="h-72" />
      ) : !report ? (
        <div className="sheet p-8 text-ink-2">
          Todavía no se ha auditado el registro. Córrela cuando quieras: no cambia nada.
        </div>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="sheet relative overflow-hidden p-6">
            <p className="flex items-center gap-2 text-sm text-ink-2">
              {report.ok ? (
                <ShieldCheck className="size-5 text-paid" aria-hidden />
              ) : (
                <ShieldX className="size-5 text-held" aria-hidden />
              )}
              Revisión del {fmtDateTime(audit.createdAt)}
            </p>
            <p className="t-display mt-4 text-ink">{report.findings.length}</p>
            <p className="text-lg text-ink">pagos o aprobaciones fuera de las reglas</p>
            <dl className="mt-6 grid grid-cols-[1fr_auto] gap-y-1.5 text-[0.95rem]">
              <dt className="text-ink-2">Asientos del registro</dt>
              <dd className="tabular-nums text-ink">{report.entries}</dd>
              <dt className="text-ink-2">Decisiones revisadas</dt>
              <dd className="tabular-nums text-ink">{report.decisionsChecked}</dd>
              <dt className="text-ink-2">Pagos del agente rehechos</dt>
              <dd className="tabular-nums text-ink">{report.paymentsChecked}</dd>
              <dt className="text-ink-2">Aprobaciones humanas</dt>
              <dd className="tabular-nums text-ink">{report.approvalsChecked}</dd>
              <dt className="text-ink-2">Cadena de huellas</dt>
              <dd className={clsx(report.chainIntact ? 'text-paid' : 'text-held')}>
                {report.chainIntact ? 'íntegra' : `rota en el asiento ${report.brokenAtSeq}`}
              </dd>
            </dl>
          </div>

          <div className="sheet p-6">
            <h2 className="t-h3 mb-4 text-ink">Invariantes</h2>
            <ul className="divide-y divide-rule">
              {report.invariants.map((inv) => (
                <li
                  key={inv.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5"
                >
                  {inv.violations === 0 ? (
                    <Check
                      className="size-4 text-paid"
                      strokeWidth={3}
                      aria-label="Sin violaciones"
                    />
                  ) : (
                    <X className="size-4 text-held" strokeWidth={3} aria-label="Con violaciones" />
                  )}
                  <span className="text-[0.95rem] text-ink">{inv.title}</span>
                  <span className="text-sm text-ink-3 tabular-nums">
                    {inv.checks} {inv.checks === 1 ? 'revisión' : 'revisiones'}
                    {inv.violations > 0 && (
                      <span className="text-held">, {inv.violations} fallas</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {report.findings.length > 0 && (
              <ul className="mt-4 grid gap-2 text-sm">
                {report.findings.map((f, i) => (
                  <li key={i} className="rounded-lg bg-held-tint/60 px-3 py-2 text-ink">
                    {f.ref ? `${f.ref}: ` : ''}
                    {f.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="t-h2 mb-2 text-ink">Registro encadenado</h2>
        <p className="mb-5 max-w-2xl text-ink-2">
          Cada asiento lleva la huella SHA-256 del anterior. Editar uno solo rompe todas las huellas
          siguientes, y el auditor lo detecta.
        </p>
        <div className="sheet overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-rule text-ink-3">
              <tr>
                <th className="px-4 py-3 font-[560]">Asiento</th>
                <th className="px-4 py-3 font-[560]">Qué pasó</th>
                <th className="px-4 py-3 font-[560]">Quién</th>
                <th className="px-4 py-3 font-[560]">Cuándo</th>
                <th className="px-4 py-3 font-[560]">Huella</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {ledger?.map((e) => (
                <tr key={e.seq}>
                  <td className="px-4 py-2.5 tabular-nums text-ink-3">{e.seq}</td>
                  <td className="px-4 py-2.5 text-ink">{LEDGER_COPY[e.type] ?? e.type}</td>
                  <td className="px-4 py-2.5 text-ink-2">{e.actor.name}</td>
                  <td className="px-4 py-2.5 text-ink-2">{fmtDateTime(e.at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-3">
                    {e.hash.slice(0, 16)}
                    <span className="text-ink-3/70"> ← {e.prevHash.slice(0, 8)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
