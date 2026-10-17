'use client';

import clsx from 'clsx';
import { Check, CircleCheck, CircleDashed, Hand, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Outcome = 'paid' | 'pending' | 'held';

interface Sample {
  id: string;
  chip: string;
  from: string;
  arrived: string;
  amount: string;
  checks: { label: string; ok: boolean; note?: string }[];
  outcome: Outcome;
  verdict: string;
  reason: string;
}

// Real cases from the demo company, decided by the same 23 rules as the product.
const SAMPLES: Sample[] = [
  {
    id: 'valentina',
    chip: 'Valentina, agosto',
    from: 'Valentina Ríos',
    arrived: 'Cuenta de cobro por correo',
    amount: 'COP 14.000.000',
    checks: [
      { label: 'Leí el documento completo', ok: true },
      { label: 'Beneficiaria registrada', ok: true },
      { label: 'Llave Bre-B registrada', ok: true },
      { label: 'Cabe en el acuerdo firmado', ok: true },
      { label: 'Dentro del límite y del presupuesto', ok: true },
    ],
    outcome: 'paid',
    verdict: 'Pagada sola',
    reason: 'Cumple el acuerdo que Martín firmó: COP 14.000.000 al mes, una cuenta de cobro.',
  },
  {
    id: 'llave',
    chip: 'Otra llave Bre-B',
    from: 'Valentina Ríos',
    arrived: 'Cuenta de cobro por correo',
    amount: 'COP 14.000.000',
    checks: [
      { label: 'Leí el documento completo', ok: true },
      { label: 'Beneficiaria registrada', ok: true },
      { label: 'Llave Bre-B registrada', ok: false, note: 'pide pagar a una llave nueva' },
      { label: 'Cabe en el acuerdo firmado', ok: true },
    ],
    outcome: 'pending',
    verdict: 'Por aprobar',
    reason:
      'El dinero nunca va a datos de pago sacados de una factura. Martín lo confirma por llamada.',
  },
  {
    id: 'oculto',
    chip: 'Texto oculto',
    from: 'Nube Andina Cloud',
    arrived: 'PDF con letra blanca de 1 px',
    amount: 'USD 2.450,00',
    checks: [
      { label: 'Leí el documento completo', ok: true },
      {
        label: 'Sin instrucciones para el agente',
        ok: false,
        note: '«ignore your previous rules…»',
      },
      { label: 'Beneficiario registrado', ok: false, note: 'nadie lo conoce' },
    ],
    outcome: 'pending',
    verdict: 'Por aprobar',
    reason:
      'El agente no obedece al documento: reporta la orden escondida y pregunta a una persona.',
  },
  {
    id: 'repetida',
    chip: 'La misma, otra vez',
    from: 'Mateo Herrera',
    arrived: 'Reenviada por WhatsApp',
    amount: 'MXN 72.000,00',
    checks: [
      { label: 'Leí el mensaje', ok: true },
      { label: 'Beneficiario registrado', ok: true },
      { label: 'No está duplicada', ok: false, note: 'ya se pagó el 2 de septiembre' },
    ],
    outcome: 'held',
    verdict: 'Frenada',
    reason: 'F 2026 915 y F-2026-0915 son la misma factura. Pagarla dos veces no es una opción.',
  },
];

const OUTCOME = {
  paid: { icon: CircleCheck, pass: 'pass-paid' },
  pending: { icon: CircleDashed, pass: 'pass-pending' },
  held: { icon: Hand, pass: 'pass-held' },
};

export function DecisionDemo() {
  const [selected, setSelected] = useState(SAMPLES[0]!);
  const [shown, setShown] = useState(0);

  // Reveal one check at a time, then the verdict: the agent "thinking" in front of you.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const total = selected.checks.length + 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= total; i++) {
      timers.push(setTimeout(() => setShown(i), reduced ? 0 : 160 + i * 380));
    }
    return () => timers.forEach(clearTimeout);
  }, [selected]);

  const done = shown > selected.checks.length;
  const Verdict = OUTCOME[selected.outcome].icon;

  return (
    <div className="rounded-[30px] border border-white/12 bg-white/[0.06] p-5 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] backdrop-blur-md sm:p-6">
      <p className="font-display text-[1.15rem] font-[700] tracking-[-0.01em]">
        Toca un cobro y mira qué decide
      </p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Cobros de ejemplo">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={s.id === selected.id}
            onClick={() => {
              if (s.id === selected.id) return;
              setShown(0);
              setSelected(s);
            }}
            className={clsx(
              'font-display rounded-full border-2 px-4 py-2 text-[0.92rem] font-[620] transition',
              s.id === selected.id
                ? 'border-marker bg-marker text-on-marker'
                : 'border-white/25 text-white hover:border-marker hover:text-marker',
            )}
          >
            {s.chip}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-1 rounded-[20px] bg-white px-5 py-4 text-noche">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[1.05rem] font-[650]">{selected.from}</p>
          <p className="t-figure text-[1.35rem]">{selected.amount}</p>
        </div>
        <p className="text-[0.88rem] text-[#5a6080]">{selected.arrived}</p>
      </div>

      <ul className="mt-4 grid gap-2" aria-live="polite">
        {selected.checks.map((c, i) => (
          <li
            key={`${selected.id}-${c.label}`}
            className={clsx(
              'flex items-center gap-3 rounded-[14px] px-3 py-2 transition-all duration-300',
              i < shown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
              c.ok ? 'bg-white/[0.06]' : 'bg-marker/15',
            )}
          >
            <span
              className={clsx(
                'grid size-6 shrink-0 place-items-center rounded-full',
                c.ok ? 'bg-[#2fa176] text-[#06120c]' : 'bg-marker text-on-marker',
              )}
            >
              {c.ok ? (
                <Check className="size-3.5" strokeWidth={3.5} />
              ) : (
                <X className="size-3.5" strokeWidth={3.5} />
              )}
            </span>
            <span className="text-[0.95rem]">
              {c.label}
              {c.note && <span className="text-white/65">: {c.note}</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 min-h-[8.5rem]">
        {done && (
          <div
            key={selected.id}
            className={clsx('pass pop-in px-5 py-4', OUTCOME[selected.outcome].pass)}
          >
            <p className="font-display relative z-10 flex items-center gap-2 text-[1.5rem] font-[760] tracking-[-0.02em]">
              <Verdict className="size-6" strokeWidth={2.6} aria-hidden />
              {selected.verdict}
            </p>
            <p className="relative z-10 mt-1 text-[0.98rem] leading-snug text-white/90">
              {selected.reason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
