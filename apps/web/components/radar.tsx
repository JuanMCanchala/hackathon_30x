'use client';

import clsx from 'clsx';
import { Eye, Radar } from 'lucide-react';
import Link from 'next/link';
import type { Signal } from '@mandato/domain';
import { useApi } from '@/lib/hooks';
import type { RadarItem } from '@/lib/types';

export function SignalList({ signals }: { signals: Signal[] }) {
  return (
    <ul className="grid gap-2">
      {signals.map((s) => (
        <li
          key={s.kind}
          className={clsx(
            'flex gap-3 rounded-[14px] px-3.5 py-3',
            s.level === 'watch' ? 'bg-marker/25' : 'bg-sheet-2',
          )}
        >
          <Eye
            className={clsx(
              'mt-0.5 size-4 shrink-0',
              s.level === 'watch' ? 'text-ink' : 'text-ink-3',
            )}
            aria-hidden
          />
          <div>
            <p className="font-display text-[0.98rem] font-[680] text-ink">{s.title}</p>
            <p className="text-[0.9rem] text-ink-2">{s.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What the radar noticed on a receipt: context for whoever approves, never a block. */
export function SignalsPanel({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) return null;
  return (
    <div className="sheet grid gap-3 p-6">
      <div>
        <h2 className="t-h3 flex items-center gap-2 text-ink">
          <Radar className="size-5 text-brand" aria-hidden /> El radar notó algo
        </h2>
        <p className="mt-1 text-sm text-ink-3">
          Comparado con los cobros anteriores de este beneficiario. No bloquea el pago: las reglas
          ya decidieron; esto es para quien revisa.
        </p>
      </div>
      <SignalList signals={signals} />
    </div>
  );
}

/** The overview's radar: recent bills with something worth a look. */
export function RadarCard() {
  const { data } = useApi<RadarItem[]>('/api/v1/radar');
  if (!data) return null;
  return (
    <div className="sheet p-5">
      <p className="font-display flex items-center gap-2 text-[1rem] font-[680] text-ink">
        <Radar className="size-5 text-brand" aria-hidden /> Radar de anomalías
      </p>
      {data.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">Nada fuera de lo normal en los cobros recientes.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {data.slice(0, 4).map((item) => (
            <li key={item.invoiceId}>
              <Link href={`/facturas/${item.invoiceId}`} className="group block">
                <p className="text-[0.92rem] font-[620] text-ink group-hover:underline">
                  {item.signals[0]!.title}
                </p>
                <p className="text-[0.82rem] text-ink-3">
                  {item.payeeName}, {item.ref}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
