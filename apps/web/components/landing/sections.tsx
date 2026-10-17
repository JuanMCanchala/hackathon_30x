import { DEFAULT_ASSUMPTIONS, type Outcome, type Rail } from '@recibido/domain';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { OutcomeStamp } from '@/components/outcome';
import { formatMoney } from '@/lib/format';
import { Reveal } from '@/components/proof-bar';
import { stagger } from '@/components/ui';

/* ---------- El problema: the three-way match has no receiving note for services ---------- */

type Cell = { text: string; kind: 'ok' | 'gap' | 'proof' };
const LEDGER: { what: string; cells: Cell[]; result: string; ours?: boolean }[] = [
  {
    what: 'Bienes',
    cells: [
      { text: 'Orden de compra', kind: 'ok' },
      { text: 'Nota de recepción', kind: 'ok' },
      { text: 'Factura', kind: 'ok' },
    ],
    result: 'Se paga sola si las tres cuadran.',
  },
  {
    what: 'Servicios',
    cells: [
      { text: 'Contrato', kind: 'ok' },
      { text: 'Nadie firma que llegó', kind: 'gap' },
      { text: 'Cuenta de cobro', kind: 'ok' },
    ],
    result: 'Alguien revisa a mano, o se paga a ciegas.',
  },
  {
    what: 'Con Recibido',
    cells: [
      { text: 'Contrato', kind: 'ok' },
      { text: 'La prueba: Toggl, GitHub, entregables', kind: 'proof' },
      { text: 'Cuenta de cobro', kind: 'ok' },
    ],
    result: 'Se paga lo probado; lo demás se pide o se escala.',
    ours: true,
  },
];

export function Problem() {
  return (
    <section
      id="problema"
      className="mx-auto grid max-w-[1200px] scroll-mt-6 gap-10 px-4 py-20 sm:px-8 lg:pt-20 lg:pb-28"
    >
      <div className="grid max-w-[46rem] gap-4">
        <h2 className="t-h2">A los servicios les falta la nota de recepción.</h2>
        <p className="text-[1.0625rem] text-ink-2">
          Con los bienes, cuentas por pagar cruza tres documentos antes de pagar. Con una cuenta de
          horas o un hito no hay quien firme que el trabajo llegó, así que casi todas terminan en la
          bandeja de alguien.
        </p>
      </div>

      <div className="sheet overflow-hidden" role="table" aria-label="Cruce de tres documentos">
        <div
          role="row"
          className="hidden grid-cols-[9rem_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] gap-4 border-b border-rule px-6 py-3 text-[0.8125rem] font-[650] text-ink-3 md:grid"
        >
          <span role="columnheader">Qué se paga</span>
          <span role="columnheader">Lo acordado</span>
          <span role="columnheader">Lo recibido</span>
          <span role="columnheader">Lo cobrado</span>
          <span role="columnheader">Qué pasa hoy</span>
        </div>
        {LEDGER.map((row) => (
          <div
            key={row.what}
            role="row"
            className={clsx(
              'grid grid-cols-3 gap-3 border-b border-rule px-4 py-5 last:border-b-0 md:grid-cols-[9rem_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] md:items-center md:gap-4 md:px-6',
              row.ours && 'bg-[color-mix(in_srgb,var(--stamp)_6%,var(--sheet))]',
            )}
          >
            <span role="rowheader" className="col-span-3 font-[800] md:col-span-1">
              {row.what}
            </span>
            {row.cells.map((c) => (
              <span key={c.text} role="cell" className="grid content-start gap-2 text-[0.875rem]">
                {c.kind === 'ok' && (
                  <Check className="size-4 text-pay" aria-hidden strokeWidth={2.5} />
                )}
                {c.kind === 'gap' && <span aria-hidden className="proof h-4 !w-16" />}
                {c.kind === 'proof' && (
                  <span aria-hidden className="proof h-4 !w-16">
                    <span className="proof-solid w-[70%]">
                      <span className="proof-tick" style={{ flex: '1 1 0' }} />
                      <span className="proof-tick" style={{ flex: '1 1 0' }} />
                      <span className="proof-tick" style={{ flex: '1 1 0' }} />
                    </span>
                  </span>
                )}
                <span className={clsx(c.kind === 'gap' ? 'text-ink-3' : 'text-ink')}>{c.text}</span>
              </span>
            ))}
            <span
              role="cell"
              className={clsx(
                'col-span-3 md:col-span-1',
                row.ours ? 'font-[700] text-ink' : 'text-ink-2',
              )}
            >
              {row.result}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Cómo decide: three moves, then the five outcomes as stamps ---------- */

const STEPS = [
  {
    verb: 'Lee',
    text: 'La cuenta llega en PDF, por correo o por el portal. Un modelo la lee y la cruza con las líneas del contrato; si no está seguro, lo dice.',
  },
  {
    verb: 'Prueba',
    text: 'Busca la evidencia de cada línea: horas en Toggl, PR fusionados en GitHub, entregables aceptados por Altamar.',
  },
  {
    verb: 'Decide',
    text: 'Reglas en código, no el modelo: proveedor, duplicados, contrato, tope, evidencia y plazo. Cada decisión deja su recibo.',
  },
];

const OUTCOMES: { outcome: Outcome; text: string }[] = [
  { outcome: 'PAY', text: 'Todo lo cobrado tiene prueba y cabe en el contrato. Programa el pago.' },
  {
    outcome: 'PAY_PART',
    text: 'Hay prueba de una parte. Paga esa parte y pide el soporte del resto.',
  },
  {
    outcome: 'ASK_VENDOR',
    text: 'Falta algo que el contratista puede arreglar. Le escribe y espera.',
  },
  {
    outcome: 'ESCALATE',
    text: 'Se sale de las reglas: otra cuenta de pago, sin contrato, sobre el tope. Decide una persona.',
  },
  { outcome: 'HOLD', text: 'Esa cuenta o ese trabajo ya se cobró. No se paga dos veces.' },
];

export function HowItDecides() {
  return (
    <section id="como-decide" className="scroll-mt-6 border-y border-rule bg-sheet">
      <div className="mx-auto grid max-w-[1200px] gap-16 px-4 py-20 sm:px-8 lg:py-28">
        <h2 className="t-h2 max-w-[22ch]">Cómo decide: lee, prueba y aplica reglas.</h2>

        <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((s) => (
            <li key={s.verb} className="grid content-start gap-3 border-t-2 border-ink pt-5">
              <span className="text-[1.75rem] leading-none font-[900] tracking-[-0.02em]">
                {s.verb}
              </span>
              <p className="max-w-[38ch] text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
          <div className="grid content-start gap-3">
            <h3 className="t-h3">Cinco salidas posibles, y ninguna es «ya veremos».</h3>
            <p className="text-ink-2">
              Cada cuenta termina en una de ellas, con la frase que la explica y los números que la
              sostienen.
            </p>
          </div>
          {/* the five stamps settle in one after another the first time the list is seen */}
          <Reveal>
            <ul className="divide-y divide-rule border-y border-rule">
              {OUTCOMES.map((o, i) => (
                <li
                  key={o.outcome}
                  className="grid gap-3 py-5 sm:grid-cols-[17rem_minmax(0,1fr)] sm:items-center sm:gap-6"
                >
                  <span>
                    <OutcomeStamp outcome={o.outcome} size="md" land delayMs={i * 70} />
                  </span>
                  <p className="rise-in text-[0.9375rem] text-ink-2" style={stagger(i, 70)}>
                    {o.text}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------- Para Blinka: local rails, timing, reconciliation ---------- */

const RAILS: { rail: Rail; name: string; where: string; currency: string }[] = [
  { rail: 'bre-b', name: 'Bre-B', where: 'Colombia', currency: 'COP' },
  { rail: 'spei', name: 'SPEI', where: 'México', currency: 'MXN' },
  { rail: 'pix', name: 'Pix', where: 'Brasil', currency: 'BRL' },
  { rail: 'ach', name: 'ACH', where: 'Estados Unidos', currency: 'USD' },
];
const bps = (b: number) => `${(b / 100).toLocaleString('es-CO', { minimumFractionDigits: 2 })} %`;

export function ForBlinka() {
  const a = DEFAULT_ASSUMPTIONS;
  return (
    <section
      id="blinka"
      className="mx-auto grid max-w-[1200px] scroll-mt-6 gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16 lg:py-28"
    >
      <div className="grid content-start gap-5">
        <h2 className="t-h2">Hecho para pagar con Blinka.</h2>
        <p className="text-[1.0625rem] text-ink-2">
          Cada pago sale por el riel local del país del contratista, el día que vence y no antes, y
          vuelve en el extracto enlazado a su cuenta, su contrato y su evidencia.
        </p>
        <p className="text-[0.875rem] text-ink-3">
          Comisiones y márgenes son supuestos simulados de la demo; el dinero que espera rinde{' '}
          {bps(a.annualYieldBps)} anual.
        </p>
      </div>

      <div className="sheet">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-rule px-4 py-3 text-[0.8125rem] font-[650] text-ink-3 sm:px-6">
          <span>Riel</span>
          <span className="text-right">Comisión</span>
          <span className="text-right">Margen</span>
        </div>
        <ul className="divide-y divide-rule">
          {RAILS.map((r) => (
            <li
              key={r.rail}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4 px-4 py-4 sm:px-6"
            >
              <span>
                <span className="block font-[800]">{r.name}</span>
                <span className="text-[0.8125rem] text-ink-3">
                  {r.where}, {r.currency}
                </span>
              </span>
              <span className="t-mono text-right">
                {formatMoney(a.railFeeUsdMinor[r.rail], 'USD')}
              </span>
              <span className="t-mono text-right">{bps(a.railSpreadBps[r.rail])}</span>
            </li>
          ))}
          <li className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4 px-4 py-4 text-ink-3 sm:px-6">
            <span>
              <span className="block font-[800] text-ink-2">Transferencia internacional</span>
              <span className="text-[0.8125rem]">lo que se evita</span>
            </span>
            <span className="t-mono text-right line-through decoration-1">
              {formatMoney(a.wireFeeUsdMinor, 'USD')}
            </span>
            <span className="t-mono text-right line-through decoration-1">
              {bps(a.wireSpreadBps)}
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}
