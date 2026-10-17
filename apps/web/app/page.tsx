import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Logo } from '@/components/brand';
import { Measured } from '@/components/landing/measured';
import { ForBlinka, HowItDecides, Problem } from '@/components/landing/sections';
import { Specimen } from '@/components/landing/specimen';
import { ThemeSwitch } from '@/components/theme';
import { buttonClass } from '@/components/ui';

/** The hero enters once on load: headline, then the line, then the actions. */
const HERO_IN = { '--rise': '14px', '--dur': '400ms' } as CSSProperties;

const REPO = 'https://github.com/JuanMCanchala/hackathon_30x/tree/feat/recibido';

export default function Landing() {
  return (
    <>
      <header className="mx-auto flex h-18 max-w-[1200px] items-center justify-between gap-6 px-4 sm:px-8">
        <Link href="/" aria-label="Recibido, inicio">
          <Logo />
        </Link>
        <nav aria-label="Secciones de la página" className="flex items-center gap-1">
          <a
            href="#problema"
            className="hidden rounded-[6px] px-3 py-2 text-[0.9375rem] font-[600] text-ink-2 hover:text-ink md:block"
          >
            El problema
          </a>
          <a
            href="#como-decide"
            className="hidden rounded-[6px] px-3 py-2 text-[0.9375rem] font-[600] text-ink-2 hover:text-ink md:block"
          >
            Cómo decide
          </a>
          <a
            href="#medido"
            className="hidden rounded-[6px] px-3 py-2 text-[0.9375rem] font-[600] text-ink-2 hover:text-ink md:block"
          >
            Resultados
          </a>
          <span className="mx-2 hidden sm:block">
            <ThemeSwitch />
          </span>
          <Link href="/resumen" className={buttonClass('secondary', 'sm')}>
            Abrir la app
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-10 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:pt-16 lg:pb-16">
          <div className="grid content-start gap-7">
            <h1 className="t-hero rise-in max-w-[12ch]" style={HERO_IN}>
              Ningún pago sin prueba de entrega.
            </h1>
            <p
              className="rise-in max-w-[46ch] text-[1.125rem] text-ink-2 sm:text-[1.25rem]"
              style={{ ...HERO_IN, '--delay': '90ms' } as CSSProperties}
            >
              Recibido paga las cuentas de servicios solo por el trabajo que puede probar, le pide
              al contratista lo que falta y te deja a ti solo lo que se sale de las reglas.
            </p>
            <div
              className="rise-in flex flex-wrap gap-3"
              style={{ ...HERO_IN, '--delay': '180ms' } as CSSProperties}
            >
              <Link href="/recorrido" className={buttonClass('primary')}>
                Ver la demo
                <ArrowRight className="size-4" aria-hidden strokeWidth={2.5} />
              </Link>
              <a href="#como-decide" className={buttonClass('secondary')}>
                Cómo decide
              </a>
            </div>
          </div>
          <Specimen />
        </section>

        <Problem />
        <HowItDecides />
        <Measured />
        <ForBlinka />
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-8">
          <Logo />
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] text-ink-2">
            <li>
              <a href={REPO} className="hover:text-ink hover:underline">
                Código
              </a>
            </li>
            <li>
              <a href="/docs" className="hover:text-ink hover:underline">
                API
              </a>
            </li>
            <li>
              <Link href="/recorrido" className="hover:text-ink hover:underline">
                Recorrido guiado
              </Link>
            </li>
          </ul>
          <ThemeSwitch />
          <p className="w-full text-[0.875rem] text-ink-3">
            Datos ficticios de Altamar Labs Inc. Hecho para el reto de Blinka del Hackathon 30X.
          </p>
        </div>
      </footer>
    </>
  );
}
