import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-3 px-6 text-center">
      <h1 className="t-h2 text-ink">Esta página no existe</h1>
      <p className="text-ink-2">
        Puede que el enlace esté mal escrito o que la demo se haya reiniciado.
      </p>
      <Link href="/" className="text-brand hover:underline">
        Volver al resumen
      </Link>
    </main>
  );
}
