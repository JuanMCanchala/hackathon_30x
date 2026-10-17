import Link from 'next/link';
import { Logo } from '@/components/brand';
import { buttonClass } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg content-center gap-5 px-6">
      <Logo />
      <h1 className="t-h1">Esta página no existe.</h1>
      <p className="text-ink-2">
        Puede que el enlace esté mal escrito o que la cuenta sea de antes del último reinicio de la
        demo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/resumen" className={buttonClass('primary')}>
          Ir al resumen
        </Link>
        <Link href="/" className={buttonClass('secondary')}>
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
