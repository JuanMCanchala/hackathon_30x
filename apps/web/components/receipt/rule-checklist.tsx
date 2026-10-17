'use client';

import clsx from 'clsx';
import { Check, CircleMinus, Hand, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import type { RuleResult } from '@/lib/types';

const STAGES: { id: RuleResult['stage']; title: string; question: string }[] = [
  { id: 'reading', title: 'Lectura', question: '¿Es un cobro legible, completo y coherente?' },
  {
    id: 'payee',
    title: 'Beneficiario',
    question: '¿Le pagamos a alguien registrado, a su cuenta registrada?',
  },
  { id: 'duplicate', title: 'Duplicados', question: '¿Es un cobro nuevo?' },
  { id: 'mandate', title: 'Acuerdo firmado', question: '¿Cabe en lo que una persona firmó?' },
  {
    id: 'policy',
    title: 'Política y saldo',
    question: '¿Respeta los límites, el presupuesto y el saldo?',
  },
  { id: 'requester', title: 'Quién la pide', question: '¿Quien la pidió tenía permiso?' },
];

function ResultIcon({ result }: { result: RuleResult }) {
  if (result.status === 'pass')
    return <Check className="size-4 text-paid" strokeWidth={3} aria-label="Cumple" />;
  if (result.status === 'skip')
    return (
      <CircleMinus
        className="size-4 text-ink-3"
        aria-label={result.safeSkip ? 'No aplica' : 'No se pudo verificar'}
      />
    );
  return result.onFail === 'HOLD' ? (
    <Hand className="size-4 text-held" strokeWidth={2.4} aria-label="Frena el pago" />
  ) : (
    <TriangleAlert
      className="size-4 text-pending"
      strokeWidth={2.4}
      aria-label="Necesita aprobación"
    />
  );
}

export function RuleChecklist({ results }: { results: RuleResult[] }) {
  const failing = results.filter(
    (r) => r.status === 'fail' || (r.status === 'skip' && !r.safeSkip),
  );
  const [showAll, setShowAll] = useState(failing.length === 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-h3 text-ink">Las {results.length} verificaciones</h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-sm text-brand hover:underline"
        >
          {showAll ? 'Mostrar solo lo que no cumplió' : `Mostrar las ${results.length}`}
        </button>
      </div>
      <p className="mb-4 text-sm text-ink-2">
        {(() => {
          const count = (status: RuleResult['status']) =>
            results.filter((r) => r.status === status).length;
          const pass = count('pass');
          const fail = count('fail');
          const skip = count('skip');
          return `${pass} ${pass === 1 ? 'cumple' : 'cumplen'}, ${fail} no ${fail === 1 ? 'cumple' : 'cumplen'} y ${skip} no ${skip === 1 ? 'aplica' : 'aplican'}.`;
        })()}{' '}
        Cada regla es código: el modelo de lenguaje solo leyó el documento.
      </p>
      <ol className="grid gap-5">
        {STAGES.map((stage) => {
          const items = results.filter(
            (r) => r.stage === stage.id && (showAll || failing.includes(r)),
          );
          if (items.length === 0) return null;
          return (
            <li key={stage.id}>
              <p className="text-[0.95rem] font-[650] text-ink">{stage.title}</p>
              <p className="mb-2 text-sm text-ink-3">{stage.question}</p>
              <ul className="divide-y divide-rule overflow-hidden rounded-[14px] bg-sheet-2">
                {items.map((r) => (
                  <li
                    key={r.id}
                    className={clsx(
                      'grid grid-cols-[auto_1fr] gap-x-3 px-3.5 py-3',
                      r.status === 'fail' &&
                        (r.onFail === 'HOLD' ? 'bg-held-tint/60' : 'bg-pending-tint/60'),
                    )}
                  >
                    <span className="mt-0.5">
                      <ResultIcon result={r} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[0.93rem] font-[600] text-ink">
                        {r.title}
                        {r.status === 'fail' && (
                          <span className="text-xs font-[500] text-ink-2">
                            {r.onFail === 'HOLD' ? 'frena el pago' : 'pide aprobación'}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{r.detail}</p>
                      {(r.observed || r.expected) && r.status === 'fail' && (
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                          {r.observed && (
                            <>
                              <dt className="text-ink-3">Observado</dt>
                              <dd className="tabular-nums text-ink">{r.observed}</dd>
                            </>
                          )}
                          {r.expected && (
                            <>
                              <dt className="text-ink-3">Esperado</dt>
                              <dd className="tabular-nums text-ink">{r.expected}</dd>
                            </>
                          )}
                        </dl>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
