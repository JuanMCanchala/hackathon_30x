'use client';

import { Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { formatMoney, formatUsd } from '@mandato/domain';
import { PaymentTimeline } from '@/components/payment-timeline';
import { Button, Empty, PageHeader, Skeleton } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { PaymentView, PaymentsResponse } from '@/lib/types';

const longDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`));

function daysFrom(today: string, date: string): string {
  const days = Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'mañana';
  return `en ${days} días`;
}

function Row({ payment, today }: { payment: PaymentView; today: string }) {
  return (
    <li className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <Link
          href={`/facturas/${payment.invoiceId}`}
          className="font-display block truncate text-[1.05rem] font-[680] text-ink hover:underline"
        >
          {payment.payeeName}
        </Link>
        <p className="truncate text-sm text-ink-3">
          {payment.ref}
          {payment.title ? `, ${payment.title}` : ''}
        </p>
      </div>
      <div className="sm:text-right">
        <p className="t-figure text-[1.15rem] text-ink">
          {formatMoney(payment.amountMinor, payment.currency)}
        </p>
        <p className="text-sm text-ink-3">
          {payment.railName}
          {payment.status === 'scheduled' ? `, ${daysFrom(today, payment.scheduledFor)}` : ''}
        </p>
        {payment.reference && (
          <p className="font-mono text-[0.72rem] text-ink-3">{payment.reference}</p>
        )}
      </div>
      <PaymentTimeline payment={payment} compact />
    </li>
  );
}

export default function PagosPage() {
  const { data, isLoading } = useApi<PaymentsResponse>('/api/v1/payments');
  const { mutate } = useSWRConfig();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const result = await post<{ sent: number; settled: number }>('/api/v1/payments/run');
      toast(
        result.sent || result.settled
          ? `${result.sent} enviadas, ${result.settled} llegaron`
          : 'No había transferencias para hoy',
        { description: 'Cada movimiento quedó en el registro encadenado.' },
      );
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudieron ejecutar los pagos.');
    } finally {
      setRunning(false);
    }
  };

  if (isLoading || !data) return <Skeleton className="h-[520px]" />;

  const upcoming = data.items
    .filter((p) => p.status === 'scheduled')
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const out = data.items.filter((p) => p.status !== 'scheduled');
  const byDay = new Map<string, PaymentView[]>();
  for (const p of upcoming) byDay.set(p.scheduledFor, [...(byDay.get(p.scheduledFor) ?? []), p]);
  const dueToday = upcoming.filter((p) => p.scheduledFor <= data.today).length;
  const t = data.treasury;

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Pagos"
        lead="Lo que el agente pagó o una persona aprobó sale el día que vence, no antes, por el riel de cada beneficiario y siempre a su cuenta registrada."
        actions={
          <Button
            variant="primary"
            icon={<Send className="size-4" aria-hidden />}
            onClick={run}
            loading={running}
          >
            Ejecutar pagos de hoy{dueToday ? ` (${dueToday})` : ''}
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="sheet p-6">
          <p className="text-sm text-ink-2">Saldo en la cuenta hoy</p>
          <p className="t-figure mt-1 text-[2.2rem] leading-none text-ink">
            {formatUsd(t.balanceUsdCents)}
          </p>
          <p className="mt-2 text-sm text-ink-3">Ya salieron {formatUsd(t.sentUsdCents)}</p>
        </div>
        <div className="sheet p-6">
          <p className="text-sm text-ink-2">Programado</p>
          <p className="t-figure mt-1 text-[2.2rem] leading-none text-ink">
            {formatUsd(t.scheduledUsdCents)}
          </p>
          <p className="mt-2 text-sm text-ink-3">
            {upcoming.length} {upcoming.length === 1 ? 'transferencia' : 'transferencias'} por salir
          </p>
        </div>
        <div className="rounded-[22px] bg-marker p-6 text-on-marker">
          <p className="text-sm font-[560]">Después de lo programado</p>
          <p className="t-figure mt-1 text-[2.2rem] leading-none">
            {formatUsd(t.afterScheduledUsdCents)}
          </p>
          <p className="mt-2 text-sm opacity-80">Lo que queda si todo sale a tiempo</p>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="t-h2 text-ink">Próximos pagos</h2>
        {upcoming.length === 0 ? (
          <p className="text-ink-2">
            No hay transferencias programadas. Cuando el agente pague o alguien apruebe un cobro,
            aparecerá aquí con su fecha de vencimiento.
          </p>
        ) : (
          [...byDay].map(([day, items]) => (
            <div key={day} className="grid gap-2">
              <p className="font-display px-1 text-[1rem] font-[680] text-ink first-letter:uppercase">
                {longDate(day)}{' '}
                <span className="font-sans text-sm font-[450] text-ink-3">
                  {daysFrom(data.today, day)}
                </span>
              </p>
              <ul className="sheet divide-y divide-rule overflow-hidden">
                {items.map((p) => (
                  <Row key={p.id} payment={p} today={data.today} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="grid gap-4">
        <h2 className="t-h2 text-ink">Ya salieron</h2>
        {out.length === 0 ? (
          <Empty title="Aún no ha salido ninguna transferencia">
            Procesa agosto en el recorrido guiado: los pagos salen en sus fechas de vencimiento.
          </Empty>
        ) : (
          <ul className="sheet divide-y divide-rule overflow-hidden">
            {out.map((p) => (
              <Row key={p.id} payment={p} today={data.today} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
