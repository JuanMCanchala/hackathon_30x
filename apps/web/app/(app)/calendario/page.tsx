'use client';

import { CalendarDays, Copy, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Page } from '@/components/shell';
import { Button, Empty, PageHeader, Skeleton } from '@/components/ui';
import { ApiError, del } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { CalendarEntry } from '@/lib/types';

const fmtDay = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export default function CalendarPage() {
  const { data, mutate } = useApi<CalendarEntry[]>('/api/v1/calendar');

  const remove = async (entry: CalendarEntry) => {
    try {
      await del(`/api/v1/calendar/${entry.id}`);
      await mutate();
      toast('Salió del calendario', { description: entry.title });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo quitar.');
    }
  };

  const days = new Map<string, CalendarEntry[]>();
  for (const e of data ?? []) days.set(e.scheduledFor, [...(days.get(e.scheduledFor) ?? []), e]);

  return (
    <Page>
      <PageHeader
        title="Calendario"
        lead="Lo que el equipo aprobó para publicar. Cada pieza viene de un tema del radar y nadie la publica sola: aquí queda lista para copiar."
      />
      {!data && <Skeleton className="h-80" />}
      {data && data.length === 0 && (
        <Empty
          title="Todavía no hay nada aprobado"
          action={
            <Link href="/radar" className="font-[600] text-brand hover:underline">
              Elegir un tema del radar
            </Link>
          }
        >
          Abre un tema que esté creciendo, revisa cómo lo contaría 30X y apruébalo para un día.
        </Empty>
      )}
      <div className="grid gap-8">
        {[...days].map(([day, entries]) => (
          <section key={day} className="grid gap-3">
            <h2 className="t-h3 flex items-center gap-2 text-ink first-letter:uppercase">
              <CalendarDays className="size-5 text-brand" aria-hidden />
              {fmtDay.format(new Date(`${day}T12:00:00Z`))}
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {entries.map((e) => (
                <li key={e.id} className="sheet grid content-start gap-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-tint px-2.5 py-0.5 text-[0.78rem] font-[700] text-brand">
                      {e.format}
                    </span>
                    <Link
                      href={`/tema/${e.topicId}`}
                      className="text-[0.86rem] font-[600] text-ink-2 hover:text-brand"
                    >
                      {e.topicName}
                    </Link>
                  </div>
                  <p className="font-[700] text-ink">{e.title}</p>
                  <p className="line-clamp-6 text-[0.92rem] whitespace-pre-line text-ink-2">
                    {e.body}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
                    <span className="text-[0.8rem] text-ink-3">Aprobó {e.approvedBy}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        icon={<Copy className="size-4" aria-hidden />}
                        onClick={async () => {
                          await navigator.clipboard.writeText(e.body);
                          toast('Copiado');
                        }}
                      >
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 className="size-4" aria-hidden />}
                        onClick={() => remove(e)}
                      >
                        Quitar
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Page>
  );
}
