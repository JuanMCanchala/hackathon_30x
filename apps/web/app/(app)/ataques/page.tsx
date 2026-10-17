'use client';

import { ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { Button, Empty, PageHeader, Skeleton, StatusTag } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import type { Catalog, InvoiceDetail, RuleMeta } from '@/lib/types';

type Attack = Catalog['attacks'][number];

function AttackResult({
  invoiceId,
  caughtBy,
  titles,
}: {
  invoiceId: string;
  caughtBy: string;
  titles: Map<string, string>;
}) {
  const { data } = useApi<InvoiceDetail>(`/api/v1/invoices/${invoiceId}`);
  if (!data?.decision) return <Skeleton className="h-16" />;
  const failing = data.decision.results.filter((r) => r.status === 'fail');
  const caught = failing.some((r) => r.id === caughtBy);
  return (
    <Link
      href={`/facturas/${invoiceId}`}
      className="grid gap-1.5 rounded-[14px] bg-sheet-2 px-3.5 py-3 transition-colors hover:bg-fill"
    >
      <span className="flex flex-wrap items-center gap-2">
        <StatusTag status={data.status} />
        <span className="text-sm text-ink-3">{data.ref}</span>
      </span>
      {data.outcome === 'PAY' ? (
        <span className="text-sm text-ink-2">Pagada: este cobro sí cabía en lo firmado.</span>
      ) : (
        <span className="text-sm text-ink">
          Atrapada por <span className="font-[620]">{titles.get(caughtBy) ?? caughtBy}</span>
          {caught && failing.length > 1 && (
            <span className="text-ink-2">
              {' '}
              y también por{' '}
              {failing
                .filter((r) => r.id !== caughtBy)
                .map((r) => r.title.toLowerCase())
                .join(', ')}
            </span>
          )}
          .
        </span>
      )}
    </Link>
  );
}

function AttackCard({ attack, titles }: { attack: Attack; titles: Map<string, string> }) {
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [launchedAgentInvoice, setAgentInvoice] = useState<string | null>(null);
  const agentInvoice = launchedAgentInvoice ?? attack.agentInvoice?.id ?? null;
  const launched = attack.bills.filter((b) => b.invoice).map((b) => b.invoice!.id);
  const done = attack.agentRequest
    ? agentInvoice !== null
    : launched.length === attack.bills.length && launched.length > 0;

  const launch = async () => {
    setBusy(true);
    try {
      const result = await post<{ results: { invoiceId: string }[] }>(
        `/api/v1/demo/attacks/${attack.id}`,
      );
      if (attack.agentRequest) setAgentInvoice(result.results.at(-1)?.invoiceId ?? null);
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo lanzar el ataque.');
    } finally {
      setBusy(false);
    }
  };

  const results = [...launched, ...(agentInvoice ? [agentInvoice] : [])];

  return (
    <article className="sheet grid content-start gap-4 p-5">
      <div>
        <h2 className="t-h3 text-ink">{attack.title}</h2>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink-2">{attack.attempt}</p>
      </div>
      {results.length > 0 ? (
        <div className="grid gap-2">
          {results.map((id) => (
            <AttackResult key={id} invoiceId={id} caughtBy={attack.caughtBy} titles={titles} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-3">
          La regla que debería atraparlo: {titles.get(attack.caughtBy) ?? attack.caughtBy}.
        </p>
      )}
      {!done && (
        <Button variant="secondary" onClick={launch} loading={busy} className="justify-self-start">
          Lanzar este ataque
        </Button>
      )}
    </article>
  );
}

export default function AtaquesPage() {
  const { data: catalog, isLoading } = useApi<Catalog>('/api/v1/demo/catalog');
  const { data: rules } = useApi<RuleMeta[]>('/api/v1/rules');
  const { mutate } = useSWRConfig();
  const [all, setAll] = useState(false);
  const titles = new Map((rules ?? []).map((r) => [r.id as string, r.title]));

  const launchAll = async () => {
    if (!catalog) return;
    setAll(true);
    try {
      for (const attack of catalog.attacks) {
        if (attack.bills.length > 0 && attack.bills.every((b) => b.invoice)) continue;
        await post(`/api/v1/demo/attacks/${attack.id}`);
      }
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Un ataque no se pudo lanzar.');
    } finally {
      setAll(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Ataca al agente"
        lead="Once trucos reales para sacarle un pago que no debe hacer. Lánzalos y mira qué regla atrapa a cada uno. Aprobar un solo pago indebido descalifica: por eso el agente niega por defecto."
        actions={
          <Button
            variant="primary"
            onClick={launchAll}
            loading={all}
            icon={<ShieldCheck className="size-4" aria-hidden />}
          >
            Lanzar todos
          </Button>
        }
      />
      {isLoading && !catalog ? (
        <Skeleton className="h-96" />
      ) : !catalog?.seeded ? (
        <Empty title="La demo no está lista">Reinicia la demo desde el recorrido guiado.</Empty>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {catalog.attacks.map((attack) => (
            <AttackCard key={attack.id} attack={attack} titles={titles} />
          ))}
        </div>
      )}
      <p className="mt-8 max-w-3xl text-sm text-ink-3">
        Los ataques se deciden con el reloj real y con todo lo que ya pasó en la demo. Si lanzas uno
        antes de procesar agosto y septiembre, algunos se atrapan por otra regla. El laboratorio no
        cuenta en la escalera de confianza.
      </p>
    </div>
  );
}
