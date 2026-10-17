import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-3 px-6 text-center">
      <h1 className="t-h2 text-ink">Esta página no existe</h1>
      <p className="text-ink-2">
        Puede que el enlace esté mal escrito o que el tema ya no esté en el radar.
      </p>
      <Link href="/" className="font-[600] text-brand hover:underline">
        Volver al radar de la semana
      </Link>
    </main>
  );
}
