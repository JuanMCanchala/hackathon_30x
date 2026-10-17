import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import { formatDate, formatHours } from '@/lib/format';
import type { EvidenceItem } from '@/lib/types';
import type { ProofTick } from './proof-bar';

const ORIGIN: Record<EvidenceItem['origin'], string> = {
  live: 'en vivo',
  fixture: 'fixture',
  csv: 'CSV',
};

const SOURCE: Record<EvidenceItem['source'], string> = {
  github: 'GitHub',
  toggl: 'Toggl',
  linear: 'Linear',
  entregables: 'Entregables',
  medidor: 'Medidor',
  entregas: 'Entregas',
};

const KIND: Record<EvidenceItem['kind'], string> = {
  pr_merged: 'PR fusionado',
  pr_open: 'PR abierto',
  time_entry: 'Horas',
  ticket_closed: 'Ticket cerrado',
  ticket_open: 'Ticket abierto',
  deliverable_accepted: 'Entregable aceptado',
  deliverable_pending: 'Entregable pendiente',
  usage_report: 'Reporte de uso',
  delivery_confirmed: 'Entrega confirmada',
};

/** Where an evidence item came from: live (GitHub), a dataset fixture or an uploaded CSV. */
export function OriginBadge({ origin }: { origin: EvidenceItem['origin'] }) {
  return (
    <span
      className={clsx(
        't-mono inline-flex h-5 items-center rounded-[4px] border px-1.5 text-[0.6875rem] font-[600] whitespace-nowrap',
        origin === 'live' ? 'border-pay text-pay' : 'border-rule-strong text-ink-2',
      )}
    >
      {ORIGIN[origin]}
    </span>
  );
}

/** One evidence item as a ledger row: source, what it is, its measure, its origin and its link. */
export function EvidenceRow({ item, counted = true }: { item: EvidenceItem; counted?: boolean }) {
  const measure = item.minutes !== undefined ? formatHours(item.minutes) : (item.quantity ?? null);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-2 text-[0.875rem]">
      <span className="min-w-0">
        <span className="font-[650] text-ink">{SOURCE[item.source]}</span>
        <span className="text-ink-3"> · {KIND[item.kind]}</span>
        {!counted && <span className="text-ink-3"> · respaldo, no suma</span>}
        <span className="block truncate text-ink-2">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-ink underline"
            >
              {item.title}
              <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">(abre en otra pestaña)</span>
            </a>
          ) : (
            item.title
          )}
          <span className="t-mono text-ink-3">
            {' '}
            · {item.ref} · {formatDate(item.occurredAt)}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        {measure && <span className="t-mono text-ink">{measure}</span>}
        <OriginBadge origin={item.origin} />
      </span>
    </li>
  );
}

/** Proof-bar ticks for a line's evidence: hours weigh by their minutes, the rest equally. */
export function ticksOf(
  lines: { evidencedMinor: number; evidence: EvidenceItem[] }[],
): ProofTick[] {
  return lines.flatMap((l, li) => {
    const total = l.evidence.reduce((s, e) => s + (e.minutes ?? 1), 0);
    if (l.evidencedMinor <= 0) return [];
    // proven without items (a retainer: the signed schedule is enough) is one solid tick
    if (total === 0) return [{ id: `${li}:schedule`, weight: l.evidencedMinor, label: 'Contrato' }];
    return l.evidence.map((e) => ({
      id: `${li}:${e.id}`,
      weight: (l.evidencedMinor * (e.minutes ?? 1)) / total,
      label: e.title,
    }));
  });
}
