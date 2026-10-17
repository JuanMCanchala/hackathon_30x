'use client';

import { RotateCcw } from 'lucide-react';
import { useRef, useState, type CSSProperties } from 'react';
import { OutcomeStamp } from '@/components/outcome';
import { fillDurationMs, ProofBar, useInView, type ProofTick } from '@/components/proof-bar';
import { Mono } from '@/components/ui';
import { formatMoney } from '@/lib/format';

/*
 * Daniela Ospina's September bill (dataset oct-03): 160 h billed at COP 130.000, and the 20 days
 * she logged in Toggl on api-pagos, 92 h in all. The sentences are the engine's own (explain.ts).
 */
const MINUTES = [
  ['01', 285],
  ['02', 315],
  ['03', 255],
  ['04', 300],
  ['07', 270],
  ['09', 285],
  ['10', 315],
  ['11', 255],
  ['14', 300],
  ['15', 270],
  ['16', 285],
  ['17', 315],
  ['18', 255],
  ['21', 300],
  ['22', 270],
  ['24', 285],
  ['25', 315],
  ['28', 255],
  ['29', 300],
  ['30', 90],
] as const;
const TICKS: ProofTick[] = MINUTES.map(([day, minutes]) => ({
  id: day,
  weight: minutes,
  label: `Toggl, ${Number(day)} sep: ${(minutes / 60).toLocaleString('es-CO')} h`,
}));
const RATE_MINOR = 130_000_00;
const BILLED_MINOR = 160 * RATE_MINOR;
const PROVEN_MINOR = 92 * RATE_MINOR;

const SUMMARY =
  'Pagamos 92 h de 160 h facturadas: hay registro de 92 h en Toggl para septiembre. Pedimos a Daniela el soporte de las 68 h restantes.';
const VENDOR_MESSAGE =
  'Hola Daniela: facturaste 160 h en la cuenta DO-2026-09 y hay registro de 92 h para septiembre. Ya programamos el pago de las 92 h. ¿Puedes adjuntar el registro del resto o enviar la cuenta corregida?';

const STAMP_AT = fillDurationMs(TICKS.length) + 120;
const MESSAGE_AT = STAMP_AT + 420;

/** The hero specimen: bill, then evidence, then decision. Replays on demand. */
export function Specimen() {
  const [run, setRun] = useState(0);
  const ref = useRef<HTMLElement>(null);
  const play = useInView(ref);
  return (
    <figure
      ref={ref}
      data-play={play ? 'true' : 'false'}
      className="sheet shadow-sheet relative grid gap-6 p-5 sm:p-7"
      aria-label="Ejemplo: la cuenta de Daniela Ospina"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-[800]">Daniela Ospina</p>
          <p className="text-[0.875rem] text-ink-2">Desarrollo backend, API de pagos</p>
        </div>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="btn h-8 shrink-0 gap-1.5 px-2.5 text-[0.8125rem] text-ink-2 hover:bg-fill hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden strokeWidth={2.25} />
          Repetir
        </button>
      </div>

      <div className="grid gap-1 border-t border-rule pt-5">
        <Mono className="text-[0.8125rem] text-ink-3">Cuenta DO-2026-09 · septiembre 2026</Mono>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="t-figure text-[clamp(1.75rem,1.2rem+2vw,2.5rem)]">160 h</span>
          <Mono className="text-[0.9375rem] text-ink-2">
            × COP 130.000 = <span className="text-ink">{formatMoney(BILLED_MINOR, 'COP')}</span>
          </Mono>
        </div>
      </div>

      <div key={`bar-${run}`} className="grid gap-2">
        <ProofBar
          billedMinor={BILLED_MINOR}
          evidencedMinor={PROVEN_MINOR}
          ticks={TICKS}
          currency="COP"
          size="lg"
          play={play}
          legend={{ proven: '92 h con prueba en Toggl', unproven: '68 h sin prueba' }}
        />
        <p className="text-[0.8125rem] text-ink-3">
          Cada marca es un día registrado en Toggl, proyecto api-pagos.
        </p>
      </div>

      <div key={`decision-${run}`} className="grid gap-4 border-t border-rule pt-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <OutcomeStamp outcome="PAY_PART" size="lg" land delayMs={STAMP_AT} />
          <span
            className="rise-in t-mono text-[0.9375rem]"
            style={{ '--delay': `${STAMP_AT}ms` } as CSSProperties}
          >
            Programa el pago de {formatMoney(PROVEN_MINOR, 'COP')}
          </span>
        </div>
        <p
          className="rise-in text-[0.9375rem] text-ink-2"
          style={{ '--delay': `${STAMP_AT + 120}ms` } as CSSProperties}
        >
          {SUMMARY}
        </p>
        <blockquote
          className="rise-in grid gap-1.5 rounded-[10px] bg-fill px-4 py-3 text-[0.9375rem]"
          style={{ '--delay': `${MESSAGE_AT}ms` } as CSSProperties}
        >
          <span className="text-[0.75rem] font-[700] text-ink-3">
            Recibido le escribe a Daniela
          </span>
          {VENDOR_MESSAGE}
        </blockquote>
      </div>
    </figure>
  );
}
