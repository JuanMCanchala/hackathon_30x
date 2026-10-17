'use client';

import clsx from 'clsx';
import { ArrowRight, ArrowUpRight, Check, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Button, buttonClass, Mono } from '@/components/ui';
import { api, useBills, useTour } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useFresh } from '@/lib/motion';
import type { Phase, TourAction, TourState } from '@/lib/types';

interface Step {
  title: string;
  body: string;
  watch: string;
  action?: TourAction;
  href: string;
  linkLabel: string;
}

const STEPS: Step[] = [
  {
    title: 'El problema',
    body: 'Altamar Labs le paga a 14 contratistas en Colombia, México y Brasil. Para las cuentas de servicios no existe una nota de recepción: nadie puede probar que el trabajo se entregó, así que hoy todas pasan por una persona.',
    watch:
      'Septiembre ya ocurrió con los servicios reales: mira en Proveedores el contrato de cada uno y la regla que prueba la entrega.',
    href: '/proveedores',
    linkLabel: 'Ver proveedores',
  },
  {
    title: 'Llegan las cuentas de octubre',
    action: 'arrive-october',
    body: 'Entran una a una, en PDF, correo o chat. Recibido lee cada cuenta, la cruza con el contrato y con la evidencia, y decide.',
    watch:
      'Los cinco sellos: PAGAR, PAGAR UNA PARTE (Daniela facturó 160 h y hay registro de 92 h), PEDIR AL PROVEEDOR, ESCALAR A UNA PERSONA (una cuenta que pide pagarle a otra cuenta bancaria) y FRENAR (una cuenta reenviada).',
    href: '/cuentas',
    linkLabel: 'Ver las cuentas',
  },
  {
    title: 'Daniela responde con la cuenta corregida',
    action: 'reply-daniela',
    body: 'Recibido le pidió el soporte de las 68 h que faltan. Ella responde por el portal con una cuenta corregida por 92 h, y el caso se cierra sin una persona.',
    watch:
      'En el recibo de Daniela, la conversación y las versiones de la cuenta. También puedes responder tú: Conversaciones → Abrir como proveedor.',
    href: '/cuentas/oct-03',
    linkLabel: 'Ver el recibo de Daniela',
  },
  {
    title: 'Lina acepta el Brand kit v2',
    action: 'accept-brand-kit',
    body: 'Estudio Ceiba cobró un hito sin entregable aceptado y quedó en PEDIR AL PROVEEDOR. Lina, del lado de Altamar, acepta el entregable.',
    watch: 'La cuenta de Estudio Ceiba cambia sola de estado a pagada, citando la aceptación.',
    href: '/cuentas/oct-04',
    linkLabel: 'Ver la cuenta de Estudio Ceiba',
  },
  {
    title: 'Se fusiona el PR del hito M3',
    action: 'merge-pr',
    body: 'El hito de Andrés depende de un pull request que seguía abierto. Al fusionarlo, la cuenta se paga sola en segundos.',
    watch: 'El sello pasa de PEDIR AL PROVEEDOR a PAGAR y el recibo cita el PR fusionado.',
    href: '/cuentas/oct-05',
    linkLabel: 'Ver la cuenta de Andrés',
  },
  {
    title: 'Lee un recibo',
    body: 'Cada decisión tiene su recibo: la barra de prueba, cada evidencia con su enlace, todos los chequeos, la razón en una frase y lo que haría falta para pagarla.',
    watch:
      'En el recibo de Daniela: "Para pagarla", lo que leyó el modelo con su confianza y el plan de pago por Bre-B con el rendimiento conservado.',
    href: '/cuentas/oct-03',
    linkLabel: 'Abrir el recibo',
  },
  {
    title: 'Cierre de octubre y extracto de Blinka',
    action: 'close-october',
    body: 'Pasa el resto de octubre: otras respuestas, decisiones de personas y el plazo de los proveedores. Llega el extracto de Blinka y Recibido lo concilia.',
    watch:
      'Cada línea del banco unida a su pago, su cuenta, su contrato y su evidencia, con la diferencia de cambio, las comisiones, un pago devuelto y una línea sin conciliar.',
    href: '/conciliacion',
    linkLabel: 'Ver la conciliación',
  },
  {
    title: 'El marcador',
    body: 'Autonomía, cero pagos indebidos según un verificador independiente, casos que resolvió el proveedor, rendimiento conservado y comisiones ahorradas.',
    watch: 'Las cifras salen del estado real de la demo, no de una tabla escrita a mano.',
    href: '/resumen',
    linkLabel: 'Ver el resumen',
  },
];

const PHASES: { id: Phase; label: string }[] = [
  { id: 'september', label: 'Septiembre cerrado' },
  { id: 'arriving', label: 'Llegan las cuentas' },
  { id: 'october', label: 'Octubre en curso' },
  { id: 'closed', label: 'Octubre cerrado' },
];

function prNumber(url: string): string {
  return url.match(/\/pull\/(\d+)/)?.[1] ?? '';
}

function ActionButton({
  step,
  tour,
  running,
  justDone,
  onRun,
}: {
  step: Step & { action: TourAction };
  tour: TourState | undefined;
  running: TourAction | 'reset' | null;
  justDone: boolean;
  onRun: (a: TourAction) => void;
}) {
  const state = tour?.actions.find((a) => a.id === step.action);
  const disabled = !state?.available || running !== null;
  if (state?.done)
    return (
      <span
        className={clsx(
          'inline-flex h-11 items-center gap-2 text-[0.9375rem] font-[700] text-pay',
          justDone && 'fade-in',
        )}
      >
        <Check className={clsx('size-4', justDone && 'check-in')} aria-hidden strokeWidth={3} />
        Hecho
      </span>
    );
  // live GitHub: the jury merges the real PR; the action moves the demo clock to that moment
  if (step.action === 'merge-pr' && tour?.livePr.live)
    return (
      <a
        href={tour.livePr.url}
        target="_blank"
        rel="noreferrer"
        aria-disabled={disabled}
        onClick={(e) => (disabled ? e.preventDefault() : onRun('merge-pr'))}
        className={clsx(buttonClass(), disabled && 'pointer-events-none opacity-50')}
      >
        Abrir el PR #{prNumber(tour.livePr.url)} en GitHub
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    );
  const label =
    step.action === 'merge-pr' && tour
      ? `Fusionar el PR #${prNumber(tour.livePr.url)}`
      : (state?.label ?? step.title);
  return (
    <Button disabled={disabled} onClick={() => onRun(step.action)}>
      {running === step.action ? 'Ejecutando…' : label}
    </Button>
  );
}

export function GuidedTour() {
  const { data: tour, error, mutate } = useTour();
  const { data: bills } = useBills();
  const { mutate: mutateAll } = useSWRConfig();
  const [running, setRunning] = useState<TourAction | 'reset' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(what: TourAction | 'reset') {
    setRunning(what);
    setFailure(null);
    try {
      await api.post(what === 'reset' ? '/demo/reset' : `/demo/actions/${what}`);
      await mutateAll(() => true);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'La acción falló.');
      void mutate();
    } finally {
      setRunning(null);
    }
  }

  const phase = tour?.phase ?? 'idle';
  const phaseIndex = PHASES.findIndex((p) => p.id === phase);
  const arrived = bills?.filter((b) => /^oct-\d+$/.test(b.datasetId ?? '')).length ?? 0;
  // the first step whose action is still to do is where the jury is
  // a step completed while you watch animates its check; the ones already done on load do not
  const justDone = useFresh(tour?.actions.filter((a) => a.done).map((a) => a.id) ?? [], !!tour);
  const current = STEPS.findIndex(
    (s) => s.action && !tour?.actions.find((a) => a.id === s.action)?.done,
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
      <ol className="grid content-start gap-4">
        {STEPS.map((s, i) => {
          const done = s.action ? tour?.actions.find((a) => a.id === s.action)?.done : false;
          const here = i === current;
          return (
            <li
              key={s.title}
              aria-current={here ? 'step' : undefined}
              className={clsx(
                'sheet grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-5 sm:px-6',
                here && 'border-ink',
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  't-mono grid size-9 place-items-center rounded-[6px] text-[0.9375rem] font-[700]',
                  done ? 'bg-pay text-sheet' : here ? 'bg-ink text-paper' : 'bg-fill text-ink-2',
                )}
              >
                {done ? (
                  <Check
                    className={clsx('size-4', s.action && justDone(s.action) && 'check-in')}
                    strokeWidth={3}
                  />
                ) : (
                  i + 1
                )}
              </span>
              <div className="grid gap-2">
                <h2 className="t-h3">{s.title}</h2>
                <p className="text-ink-2">{s.body}</p>
                <p className="text-[0.9375rem]">
                  <span className="font-[700] text-ink">Qué mirar: </span>
                  <span className="text-ink-2">{s.watch}</span>
                </p>
                {s.action === 'arrive-october' && phase === 'arriving' && (
                  <p role="status" className="text-[0.9375rem] font-[650] text-part">
                    Llegando: <Mono>{arrived}</Mono> cuentas de octubre recibidas y decididas…
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {s.action && (
                    <ActionButton
                      step={s as Step & { action: TourAction }}
                      tour={tour}
                      running={running}
                      justDone={justDone(s.action)}
                      onRun={(a) => void run(a)}
                    />
                  )}
                  <Link
                    href={s.href}
                    className="inline-flex items-center gap-1.5 text-[0.9375rem] font-[650] text-ink underline"
                  >
                    {s.linkLabel}
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <aside className="grid content-start gap-4 lg:sticky lg:top-8 lg:self-start">
        <div className="sheet grid gap-4 p-5">
          <div>
            <p className="text-[0.8125rem] font-[650] text-ink-3">Hoy en la demo</p>
            <Mono className="text-[1.125rem] font-[650]">
              {tour ? formatDateTime(tour.now) : error ? 'API sin conexión' : '…'}
            </Mono>
          </div>
          <ol aria-label="Fases de la demo" className="grid gap-1.5">
            {PHASES.map((p, i) => (
              <li
                key={p.id}
                aria-current={p.id === phase ? 'step' : undefined}
                className={clsx(
                  'flex items-center gap-2.5 text-[0.9375rem]',
                  i < phaseIndex
                    ? 'text-ink-2'
                    : i === phaseIndex
                      ? 'font-[700] text-ink'
                      : 'text-ink-3',
                )}
              >
                <span
                  aria-hidden
                  className={clsx(
                    'size-2.5 rounded-[2px]',
                    i <= phaseIndex ? 'bg-ink' : 'border border-rule-strong',
                  )}
                />
                {p.label}
              </li>
            ))}
          </ol>
          <Button variant="secondary" disabled={running !== null} onClick={() => void run('reset')}>
            <RotateCcw className="size-4" aria-hidden />
            {running === 'reset' ? 'Reiniciando…' : 'Reiniciar la demo'}
          </Button>
          <p className="text-[0.8125rem] text-ink-3">
            Vuelve al 1 de octubre con septiembre ya vivido. Puedes reiniciar en cualquier momento.
          </p>
        </div>
        {(failure || (error && !tour)) && (
          <p role="alert" className="sheet p-4 text-[0.9375rem] font-[650] text-escalate">
            {failure ?? `No hay conexión con la API: ${error?.message}`}
          </p>
        )}
        {tour && tour.problems.length > 0 && (
          <div className="sheet grid gap-2 p-4 text-[0.875rem]">
            <p className="font-[700] text-ask">Pasos que la demo saltó</p>
            <ul className="grid gap-1 text-ink-2">
              {tour.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
