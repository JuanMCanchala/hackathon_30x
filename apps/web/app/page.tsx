import { ArrowUpRight, Code2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo, Signature } from '@/components/brand';
import { DecisionDemo } from '@/components/landing/decision-demo';
import {
  Chat,
  Coins,
  Contract,
  Envelope,
  Floating,
  Pen,
  Shield,
  Spark,
  Stamp,
} from '@/components/landing/doodles';
import { CountUp, Reveal } from '@/components/landing/motion';

export const metadata: Metadata = {
  title: 'Mandato · Firma acuerdos, no pagos',
};

const REPO = 'https://github.com/JuanMCanchala/hackathon_30x';

const TICKER = [
  'Firma acuerdos, no pagos',
  '0 pagos fuera de lo firmado',
  'Lee PDF, fotos, correos y WhatsApp',
  'Explica cada decisión',
  'Te pregunta lo que no cabe',
  'Cada aprobación le enseña',
];

const STEPS = [
  {
    doodle: Envelope,
    title: 'Llega el cobro',
    body: 'Por correo, en PDF, como foto del celular, por WhatsApp o pedido por otro agente de IA. Mandato lo lee y dice qué tan seguro está de cada dato.',
  },
  {
    doodle: Contract,
    title: 'Lo revisan 23 reglas',
    body: '¿Quién cobra? ¿A qué cuenta? ¿Ya se pagó? ¿Cabe en lo que alguien firmó? Las reglas son código: el modelo de lenguaje solo lee, nunca decide.',
  },
  {
    doodle: Stamp,
    title: 'Paga, frena o te pregunta',
    body: 'Paga solo lo que cabe en un acuerdo firmado. Lo demás te llega con el motivo exacto y con lo que habría hecho falta para pagarlo solo.',
  },
];

const ATTACKS = [
  ['La misma factura, otro formato', 'No está duplicada'],
  ['Un cobro partido en dos', 'Frecuencia acordada'],
  ['«Cambié de banco», por correo', 'Destino de pago registrado'],
  ['Una orden escondida en letra blanca', 'Sin instrucciones para el agente'],
  ['Valentina con una «а» cirílica', 'Beneficiario registrado'],
  ['La moneda cambiada', 'Moneda acordada'],
  ['El monto inflado, bien sumado', 'Monto acordado'],
  ['Una factura del futuro', 'Fechas válidas'],
  ['Totales que no cuadran', 'Los números cuadran'],
  ['Dirigida a otra empresa', 'Dirigida a la empresa'],
  ['Un agente pide más de lo que puede', 'Solicitante autorizado'],
];

function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="relative z-10 -mt-8 -rotate-2 overflow-hidden bg-marker py-4 text-on-marker shadow-[0_20px_40px_-20px_rgb(16_22_58/0.6)]">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
        {items.map((t, i) => (
          <span
            key={i}
            className="font-display flex items-center gap-8 text-[clamp(1.4rem,1rem+1.6vw,2.2rem)] font-[760] tracking-[-0.025em]"
          >
            {t}
            <Spark className="size-6 shrink-0" />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="overflow-x-clip bg-paper text-ink">
      {/* ---------------------------------------------------------------- hero */}
      <header className="noche relative overflow-hidden pb-24">
        <nav className="relative z-20 mx-auto flex max-w-[1240px] items-center gap-6 px-5 py-6 sm:px-8">
          <Link href="/" aria-label="Mandato" className="text-white">
            <Logo draw />
          </Link>
          <div className="font-display ml-auto hidden items-center gap-1 text-[1rem] font-[560] text-white/80 md:flex">
            <a href="#como" className="rounded-full px-4 py-2 hover:bg-white/10 hover:text-white">
              Cómo funciona
            </a>
            <a
              href="#escalera"
              className="rounded-full px-4 py-2 hover:bg-white/10 hover:text-white"
            >
              Resultados
            </a>
            <a
              href="#ataques"
              className="rounded-full px-4 py-2 hover:bg-white/10 hover:text-white"
            >
              Ataques
            </a>
          </div>
          <Link
            href="/recorrido"
            className="font-display ml-auto rounded-full bg-marker px-5 py-2.5 text-[1rem] font-[700] text-on-marker transition hover:bg-marker-strong md:ml-2"
          >
            Abrir la demo
          </Link>
        </nav>

        <Floating className="top-28 left-[44%] hidden w-16 text-marker/80 lg:block" tilt={-12}>
          <Pen />
        </Floating>
        <Floating
          className="top-[62%] left-[38%] hidden w-14 text-marker/70 lg:block"
          tilt={8}
          delay={900}
        >
          <Coins />
        </Floating>
        <Floating className="bottom-28 left-4 w-12 text-marker/60" tilt={-6} delay={1600}>
          <Shield />
        </Floating>
        <Floating
          className="top-40 right-3 hidden w-12 text-marker/70 xl:block"
          tilt={10}
          delay={600}
        >
          <Chat />
        </Floating>
        <Floating className="top-24 left-[4%] w-7 text-marker/80" tilt={0} delay={300}>
          <Spark />
        </Floating>

        <div className="relative z-10 mx-auto grid max-w-[1240px] items-center gap-12 px-5 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:pt-16">
          <div>
            <p className="font-hand mb-3 -rotate-2 text-[1.7rem] text-marker">
              para quien paga en muchos países
            </p>
            <h1 className="font-display text-[clamp(3rem,1.3rem+5vw,5.1rem)] leading-[0.92] font-[800] tracking-[-0.05em] text-white">
              Firma acuerdos,
              <span className="relative block w-fit">
                no pagos.
                <Signature
                  strokeWidth={7}
                  className="absolute -bottom-[0.32em] left-[0.04em] h-[0.42em] w-[105%] text-marker"
                />
              </span>
            </h1>
            <p className="mt-12 max-w-xl text-[1.22rem] leading-relaxed text-white/80">
              Mandato es el agente de cuentas por pagar que lee tus facturas, paga solo lo que una
              persona ya firmó y te pregunta todo lo demás, con el motivo exacto.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/recorrido"
                className="font-display rounded-full bg-marker px-7 py-4 text-[1.1rem] font-[700] text-on-marker shadow-[0_14px_30px_-12px_rgb(255_226_92/0.6)] transition hover:-translate-y-0.5 hover:bg-marker-strong"
              >
                Entrar a la demo
              </Link>
              <a
                href="#como"
                className="font-display rounded-full border-2 border-white/30 px-7 py-[0.875rem] text-[1.1rem] font-[650] text-white transition hover:border-marker hover:text-marker"
              >
                Míralo decidir
              </a>
            </div>
          </div>
          <DecisionDemo />
        </div>
      </header>

      <Ticker />

      {/* ---------------------------------------------------------------- steps */}
      <section id="como" className="mx-auto max-w-[1240px] px-5 pt-28 pb-24 sm:px-8">
        <Reveal className="max-w-3xl">
          <h2 className="font-display text-[clamp(2.4rem,1.6rem+3vw,4rem)] leading-[0.98] font-[800] tracking-[-0.045em]">
            Tú pones las reglas una vez.{' '}
            <span className="marker">El agente las cumple cada vez.</span>
          </h2>
        </Reveal>
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ doodle: D, title, body }, i) => (
            <Reveal key={title} as="li" delay={i * 140} className="lift sheet relative p-7">
              <span className="font-display absolute top-6 right-7 text-[3.4rem] leading-none font-[800] text-fill">
                {i + 1}
              </span>
              <D className="size-14 text-brand" />
              <h3 className="font-display mt-6 text-[1.6rem] leading-tight font-[760] tracking-[-0.03em]">
                {title}
              </h3>
              <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-2">{body}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- ladder */}
      <section id="escalera" className="noche relative overflow-hidden py-28">
        <Floating className="top-16 right-[8%] w-14 text-marker/70" tilt={12}>
          <Stamp />
        </Floating>
        <Floating className="bottom-14 left-[6%] w-10 text-marker/80" delay={800}>
          <Spark />
        </Floating>
        <div className="relative z-10 mx-auto grid max-w-[1240px] gap-14 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
          <Reveal>
            <p className="font-hand -rotate-2 text-[1.7rem] text-marker">
              la escalera de confianza
            </p>
            <h2 className="font-display mt-2 text-[clamp(2.4rem,1.6rem+3vw,4rem)] leading-[0.98] font-[800] tracking-[-0.045em] text-white">
              Cada aprobación le enseña un acuerdo nuevo.
            </h2>
            <p className="mt-6 max-w-lg text-[1.15rem] leading-relaxed text-white/75">
              Cuando apruebas un cobro, el agente propone el acuerdo que lo habría pagado solo. Tú
              lo firmas o lo rechazas. El mes siguiente decide más solo, y nunca paga fuera de lo
              firmado.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            <Reveal delay={100} className="rounded-[26px] bg-white/[0.07] p-7">
              <p className="text-white/70">Agosto, decididas sin una persona</p>
              <p className="t-figure mt-2 text-[4.4rem] leading-none text-white">
                <CountUp to={53} suffix=" %" />
              </p>
            </Reveal>
            <Reveal delay={220} className="rounded-[26px] bg-marker p-7 text-on-marker">
              <p className="font-[560]">Septiembre, con lo que se firmó</p>
              <p className="t-figure mt-2 text-[4.4rem] leading-none">
                <CountUp to={71} suffix=" %" />
              </p>
            </Reveal>
            <Reveal delay={340} className="rounded-[26px] bg-white/[0.07] p-7 sm:col-span-2">
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="t-figure text-[3rem] leading-none text-marker">
                    <CountUp to={0} />
                  </p>
                  <p className="mt-2 text-white/75">pagos fuera de lo firmado</p>
                </div>
                <div>
                  <p className="t-figure text-[3rem] leading-none text-white">
                    <CountUp to={49} />
                    <span className="text-white/50">/49</span>
                  </p>
                  <p className="mt-2 text-white/75">decisiones como las esperaba la empresa</p>
                </div>
                <div>
                  <p className="t-figure text-[3rem] leading-none text-white">
                    <CountUp to={480} />
                    <span className="text-white/50">/480</span>
                  </p>
                  <p className="mt-2 text-white/75">datos bien leídos por DeepSeek V4.1 Flash</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- attacks */}
      <section id="ataques" className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <h2 className="font-display max-w-3xl text-[clamp(2.4rem,1.6rem+3vw,4rem)] leading-[0.98] font-[800] tracking-[-0.045em]">
            Once trucos para sacarle un pago. <span className="marker">Ninguno funciona.</span>
          </h2>
          <Link
            href="/ataques"
            className="font-display inline-flex items-center gap-1.5 rounded-full bg-noche px-6 py-3.5 text-[1.05rem] font-[650] text-white transition hover:-translate-y-0.5"
          >
            Lánzalos tú <ArrowUpRight className="size-5" aria-hidden />
          </Link>
        </Reveal>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ATTACKS.map(([attempt, rule], i) => (
            <Reveal
              key={attempt}
              as="li"
              delay={(i % 3) * 90}
              className="lift sheet flex items-start gap-4 p-5"
            >
              <span className="font-display grid size-10 shrink-0 place-items-center rounded-full bg-noche text-[1rem] font-[750] text-marker">
                {i + 1}
              </span>
              <span>
                <span className="font-display block text-[1.12rem] leading-snug font-[680]">
                  {attempt}
                </span>
                <span className="mt-1 block text-[0.95rem] text-ink-2">
                  Lo atrapa: <span className="font-[600] text-ink">{rule}</span>
                </span>
              </span>
            </Reveal>
          ))}
          <Reveal
            as="li"
            delay={180}
            className="grid place-items-center rounded-[22px] bg-marker p-5 text-center text-on-marker"
          >
            <p className="font-hand text-[2rem] leading-tight -rotate-2">
              y un auditor aparte revisa cada pago
            </p>
          </Reveal>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- closing */}
      <section className="noche relative overflow-hidden">
        <Floating className="top-12 left-[10%] w-14 text-marker/70" tilt={-10}>
          <Contract />
        </Floating>
        <Floating className="right-[12%] bottom-16 w-12 text-marker/70" tilt={8} delay={700}>
          <Coins />
        </Floating>
        <div className="relative z-10 mx-auto max-w-[1240px] px-5 py-28 text-center sm:px-8">
          <Reveal>
            <h2 className="font-display mx-auto max-w-4xl text-[clamp(2.6rem,1.6rem+4vw,5rem)] leading-[0.95] font-[800] tracking-[-0.05em] text-white">
              Pruébalo con Andes Labs, la empresa de la demo.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[1.15rem] text-white/75">
              Dos meses de facturas, un equipo de finanzas y un agente que gana tu confianza sin
              salirse de lo firmado.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/recorrido"
                className="font-display rounded-full bg-marker px-8 py-4 text-[1.15rem] font-[700] text-on-marker transition hover:-translate-y-0.5 hover:bg-marker-strong"
              >
                Empezar el recorrido
              </Link>
              <a
                href={REPO}
                className="font-display inline-flex items-center gap-2 rounded-full border-2 border-white/30 px-7 py-[0.875rem] text-[1.1rem] font-[650] text-white transition hover:border-marker hover:text-marker"
              >
                <Code2 className="size-5" aria-hidden /> Ver el código
              </a>
            </div>
          </Reveal>
        </div>
        <footer className="relative z-10 border-t border-white/10">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-[0.92rem] text-white/60 sm:px-8">
            <span className="text-white">
              <Logo />
            </span>
            <p>Hecho para el reto de Blinka en el Hackathon 30X, octubre de 2026.</p>
          </div>
        </footer>
      </section>
    </div>
  );
}
