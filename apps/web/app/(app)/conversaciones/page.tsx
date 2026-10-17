'use client';

import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { StatusChip } from '@/components/outcome';
import { buttonClass, Mono, PageHeader } from '@/components/ui';
import { useConversations } from '@/lib/api';
import { formatDateTime, SENDER } from '@/lib/format';
import { useFresh } from '@/lib/motion';

export default function ConversationsPage() {
  const { data, error } = useConversations();
  // a reply that arrives while you watch slides in
  const fresh = useFresh(data?.flatMap((t) => t.messages.map((m) => m.id)) ?? [], !!data);
  return (
    <>
      <PageHeader
        title="Conversaciones"
        lead="La bandeja simulada: lo que Recibido le escribió a cada proveedor y lo que respondieron. Abre el portal para responder tú como el proveedor."
      />
      {error && !data ? (
        <p className="sheet p-6 text-ink-2">No pudimos leer las conversaciones: {error.message}</p>
      ) : !data ? (
        <div className="sheet h-96" aria-busy aria-label="Cargando las conversaciones" />
      ) : data.length === 0 ? (
        <p className="sheet p-6 text-ink-2">
          Todavía no hay conversaciones: Recibido escribe cuando a una cuenta le falta prueba.
        </p>
      ) : (
        <ul className="grid gap-4">
          {data.map((t) => (
            <li key={t.billId} className="sheet grid gap-4 px-4 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-[750]">{t.vendorName ?? 'Proveedor sin identificar'}</p>
                  <p className="text-[0.875rem] text-ink-3">
                    {t.contactName && `${t.contactName} · `}
                    <Link href={`/cuentas/${t.datasetId ?? t.billId}`} className="underline">
                      Ver el recibo{t.datasetId && <Mono> {t.datasetId}</Mono>}
                    </Link>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusChip status={t.status} />
                  {t.portalToken && (
                    <Link
                      href={`/portal/${t.portalToken}`}
                      target="_blank"
                      className={buttonClass('secondary', 'sm')}
                    >
                      Abrir como proveedor
                      <ArrowUpRight className="size-4" aria-hidden />
                      <span className="sr-only">(abre en otra pestaña)</span>
                    </Link>
                  )}
                </div>
              </div>
              <ol className="grid gap-3">
                {t.messages.map((m) => {
                  const fromVendor = m.sender === 'vendor';
                  return (
                    <li
                      key={m.id}
                      className={clsx(
                        'max-w-[64ch] rounded-[10px] px-4 py-3',
                        fromVendor ? 'ml-auto bg-fill' : 'border border-rule',
                        fresh(m.id) && 'rise-in',
                      )}
                    >
                      <p className="flex flex-wrap justify-between gap-x-4 text-[0.8125rem]">
                        <span className="font-[700]">
                          {fromVendor ? (t.contactName ?? 'Proveedor') : SENDER[m.sender]}
                        </span>
                        <Mono className="text-ink-3">{formatDateTime(m.at)}</Mono>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                      {m.attachmentBillId && (
                        <p className="mt-1 text-[0.8125rem] text-ink-3">
                          Adjuntó una cuenta corregida.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
