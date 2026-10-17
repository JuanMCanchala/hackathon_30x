'use client';

import clsx from 'clsx';
import { CircleCheck, Download, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { Button, Dialog, PageHeader, Skeleton, ToneTag } from '@/components/ui';
import { ApiError, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useLive } from '@/lib/live';
import { OUTCOME_COPY, STATUS_COPY, toneOf } from '@/lib/outcomes';
import type { Catalog, CatalogBill } from '@/lib/types';

const FORMAT_COPY: Record<CatalogBill['format'], string> = {
  pdf: 'PDF',
  png: 'Foto',
  eml: 'Correo',
  txt: 'WhatsApp',
};

function BillLine({ bill }: { bill: CatalogBill }) {
  const decided = bill.invoice;
  return (
    <li className="grid grid-cols-[1fr_auto] items-start gap-3 py-2.5">
      <div className="min-w-0">
        {decided ? (
          <Link href={`/facturas/${decided.id}`} className="font-[600] text-ink hover:text-brand">
            {bill.title}
          </Link>
        ) : (
          <p className="font-[600] text-ink">{bill.title}</p>
        )}
        <p className="text-sm text-ink-2">{bill.note}</p>
        {bill.trap && (
          <p className="text-xs text-ink-3">Trampa del reto: {bill.trap.toLowerCase()}</p>
        )}
      </div>
      <div className="grid justify-items-end gap-1">
        {decided ? (
          <ToneTag tone={toneOf(decided.status)} label={STATUS_COPY[decided.status]} />
        ) : (
          <span className="text-xs text-ink-3">
            {FORMAT_COPY[bill.format]}, se espera:{' '}
            {OUTCOME_COPY[bill.expected.outcome].short.toLowerCase()}
          </span>
        )}
      </div>
    </li>
  );
}

export default function RecorridoPage() {
  const { data: catalog, isLoading } = useApi<Catalog>('/api/v1/demo/catalog');
  const { mutate } = useSWRConfig();
  const { subscribe } = useLive();
  const [running, setRunning] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'demo.progress') {
          setProgress({ processed: Number(event.data.processed), total: Number(event.data.total) });
        }
      }),
    [subscribe],
  );

  const runMonth = async (period: string) => {
    setRunning(period);
    setProgress(null);
    try {
      const result = await post<{ processed: number; actions: number }>(
        `/api/v1/demo/months/${period}/run`,
        {},
      );
      toast(`Mes procesado: ${result.processed} cobros y ${result.actions} acciones del equipo`);
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo procesar el mes.');
    } finally {
      setRunning(null);
    }
  };

  const runLive = async (id: string) => {
    try {
      await post(`/api/v1/demo/live/${id}`);
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo subir el archivo.');
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await post('/api/v1/demo/reset');
      toast('Demo reiniciada al 31 de julio de 2026');
      setConfirmReset(false);
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo reiniciar.');
    } finally {
      setResetting(false);
    }
  };

  if (isLoading && !catalog) return <Skeleton className="h-[600px]" />;
  if (!catalog) return null;
  const monthDone = (m: Catalog['months'][number]) => m.bills.every((b) => b.invoice);
  const [august, september] = catalog.months;
  const steps = [
    {
      key: '2026-08',
      title: 'Agosto: el primer mes',
      body: 'Con las reglas y acuerdos iniciales. El agente paga lo que cabe en lo firmado y pide aprobación para el resto. Martín y Sofía resuelven, y el agente propone acuerdos.',
      month: august,
    },
    {
      key: '2026-09',
      title: 'Septiembre: un escalón más arriba',
      body: 'Con los acuerdos que se firmaron en agosto. Lo que antes pedía aprobación ahora se paga solo; lo que queda son excepciones y trampas.',
      month: september,
      locked: august ? !monthDone(august) : false,
    },
  ];

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Recorrido guiado"
        lead="Andes Labs Inc. es una empresa ficticia con contratistas y proveedores en Colombia, México, Brasil, Argentina y Estados Unidos. En cinco pasos ves cómo el agente gana autonomía sin salirse de lo firmado."
        actions={
          <Button
            variant="ghost"
            icon={<RotateCcw className="size-4" aria-hidden />}
            onClick={() => setConfirmReset(true)}
          >
            Reiniciar la demo
          </Button>
        }
      />

      <ol className="grid gap-6">
        {steps.map((step, i) =>
          step.month ? (
            <li
              key={step.key}
              className="sheet grid gap-5 p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"
            >
              <div className="grid content-start gap-3">
                <p className="text-sm text-ink-3">Paso {i + 1} de 5</p>
                <h2 className="t-h2 text-ink">{step.title}</h2>
                <p className="text-ink-2">{step.body}</p>
                <p className="text-sm text-ink-3">
                  {step.month.bills.length} cobros y {step.month.actions} acciones del equipo, en el
                  orden en que pasaron.
                </p>
                {monthDone(step.month) ? (
                  <p className="flex items-center gap-2 text-[0.95rem] font-[600] text-ink">
                    <CircleCheck className="size-5 text-paid" aria-hidden /> Mes procesado
                  </p>
                ) : (
                  <div className="grid gap-2">
                    <Button
                      variant="primary"
                      onClick={() => runMonth(step.key)}
                      loading={running === step.key}
                      disabled={Boolean(step.locked) || running !== null}
                      className="justify-self-start"
                    >
                      Procesar {step.month.label.toLowerCase()}
                    </Button>
                    {step.locked && <p className="text-sm text-ink-3">Primero procesa agosto.</p>}
                    {running === step.key && progress && (
                      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-rule">
                        <div
                          className="h-full bg-brand transition-all"
                          style={{
                            width: `${(progress.processed / Math.max(1, step.month.bills.length)) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
              <ul className="divide-y divide-rule">
                {step.month.bills.map((b) => (
                  <BillLine key={b.id} bill={b} />
                ))}
              </ul>
            </li>
          ) : null,
        )}

        <li className="sheet grid gap-5 p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="grid content-start gap-3">
            <p className="text-sm text-ink-3">Paso 3 de 5</p>
            <h2 className="t-h2 text-ink">Octubre, en vivo</h2>
            <p className="text-ink-2">
              Con el reloj real. Descarga un archivo y arrástralo a «Subir factura», o súbelo desde
              aquí. Valentina ya tiene su llave nueva registrada, así que su cuenta de cobro se paga
              sola.
            </p>
          </div>
          <ul className="divide-y divide-rule">
            {catalog.live.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2.5">
                <div className="min-w-0">
                  {b.invoice ? (
                    <Link
                      href={`/facturas/${b.invoice.id}`}
                      className="font-[600] text-ink hover:text-brand"
                    >
                      {b.title}
                    </Link>
                  ) : (
                    <p className="font-[600] text-ink">{b.title}</p>
                  )}
                  <p className="text-sm text-ink-2">{b.note}</p>
                </div>
                <div className="flex items-center gap-1">
                  {b.invoice ? (
                    <ToneTag
                      tone={toneOf(b.invoice.status)}
                      label={STATUS_COPY[b.invoice.status]}
                    />
                  ) : (
                    <>
                      <a
                        href={`/api/v1/demo/files/${b.id}`}
                        className="rounded-md p-2 text-ink-2 hover:bg-sheet-2 hover:text-ink"
                        aria-label={`Descargar ${b.file}`}
                        title={`Descargar ${b.file}`}
                      >
                        <Download className="size-4" />
                      </a>
                      <Button size="sm" onClick={() => runLive(b.id)}>
                        Subir
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </li>

        <li className={clsx('sheet grid gap-3 p-6 sm:grid-cols-2')}>
          <div className="grid content-start gap-2">
            <p className="text-sm text-ink-3">Paso 4 de 5</p>
            <h2 className="t-h2 text-ink">Ataca al agente</h2>
            <p className="text-ink-2">
              Once intentos de sacarle un pago indebido: duplicados, cambio de cuenta, instrucciones
              ocultas, nombres parecidos.
            </p>
            <Link href="/ataques" className="text-brand hover:underline">
              Ir al laboratorio de ataques
            </Link>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-sm text-ink-3">Paso 5 de 5</p>
            <h2 className="t-h2 text-ink">Pídele cuentas al auditor</h2>
            <p className="text-ink-2">
              Un auditor independiente rehace cada pago y verifica la cadena del registro.
            </p>
            <Link href="/auditoria" className="text-brand hover:underline">
              Ir a la auditoría
            </Link>
          </div>
        </li>
      </ol>

      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="¿Reiniciar la demo?"
        description="Se borra todo lo procesado y Andes Labs vuelve al 31 de julio de 2026, con sus reglas y acuerdos iniciales."
      >
        <div className="flex gap-2">
          <Button variant="danger" onClick={reset} loading={resetting}>
            Reiniciar
          </Button>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancelar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
