'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import {
  CATEGORY_LABELS,
  describeMandate,
  formatUsd,
  maskDestination,
  payoutMethodLabel,
  type PayoutMethod,
} from '@mandato/domain';
import { ProposalCard } from '@/components/proposal-card';
import {
  Button,
  Dialog,
  Empty,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  ToneTag,
} from '@/components/ui';
import { ApiError, patch, post } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { PayeeView, ProposalView } from '@/lib/types';

const METHODS: PayoutMethod[] = ['bre_b', 'spei', 'pix', 'ach', 'wire', 'card', 'other'];

function DestinationDialog({ payee, onClose }: { payee: PayeeView; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [method, setMethod] = useState<PayoutMethod>(payee.destination.method);
  const [value, setValue] = useState(payee.destination.value);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/v1/payees/${payee.id}/destination`, {
        destination: { method, value, bankName: payee.destination.bankName },
        note,
      });
      toast('Datos de pago actualizados', {
        description: 'El cambio quedó en el registro con tu verificación.',
      });
      void mutate(() => true);
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Datos de pago de ${payee.name}`}
      description="El agente nunca cambia esto a partir de una factura. Verifica el dato nuevo por otro canal (una llamada) antes de guardarlo."
    >
      <div className="grid gap-4">
        <Field label="Método" htmlFor="method">
          <select
            id="method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PayoutMethod)}
            className="h-10 rounded-lg border border-rule-strong bg-sheet px-3 text-sm text-ink"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {payoutMethodLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Llave, CLABE o cuenta" htmlFor="dest">
          <Input id="dest" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="¿Cómo lo verificaste?" htmlFor="note" hint="Queda en el registro encadenado.">
          <Textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Confirmado por llamada con la persona"
          />
        </Field>
        <Button
          variant="primary"
          onClick={save}
          loading={busy}
          disabled={note.trim().length < 3 || !value.trim()}
        >
          Guardar datos de pago
        </Button>
      </div>
    </Dialog>
  );
}

export default function AcuerdosPage() {
  const { session } = useSession();
  const { mutate } = useSWRConfig();
  const { data: proposals } = useApi<ProposalView[]>('/api/v1/proposals');
  const { data: payees, isLoading } = useApi<PayeeView[]>('/api/v1/payees');
  const [editing, setEditing] = useState<PayeeView | null>(null);
  const pending = proposals?.filter((p) => p.status === 'pending') ?? [];
  const resolved = proposals?.filter((p) => p.status !== 'pending') ?? [];
  const canSign = session?.user.canSign;

  const revoke = async (payee: PayeeView) => {
    if (!payee.mandate) return;
    try {
      await post(`/api/v1/mandates/${payee.mandate.id}/revoke`, {
        reason: 'Revocado desde la pantalla de acuerdos',
      });
      toast(`Acuerdo con ${payee.name} revocado`, {
        description: 'Sus próximos cobros pedirán aprobación.',
      });
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo revocar.');
    }
  };

  return (
    <div className="grid gap-12">
      <PageHeader
        title="Acuerdos"
        lead="Un acuerdo dice a quién, cuánto y cada cuánto puede pagar el agente sin preguntar. Lo firma una persona; el agente solo lo propone."
      />

      <section className="grid gap-5">
        <h2 className="t-h2 text-ink">Propuestas del agente</h2>
        {pending.length === 0 ? (
          <p className="max-w-2xl text-ink-2">
            No hay propuestas por firmar. Cuando apruebes un cobro que podría repetirse, el agente
            propondrá aquí el acuerdo que lo habría pagado solo.
          </p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {pending.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}
        {resolved.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-brand hover:underline">
              Ver {resolved.length}{' '}
              {resolved.length === 1 ? 'propuesta resuelta' : 'propuestas resueltas'}
            </summary>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {resolved.map((p) => (
                <ProposalCard key={p.id} proposal={p} compact />
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="grid gap-5">
        <h2 className="t-h2 text-ink">Beneficiarios y sus acuerdos</h2>
        {isLoading && !payees ? (
          <Skeleton className="h-96" />
        ) : !payees?.length ? (
          <Empty title="Sin beneficiarios">Reinicia la demo desde el recorrido guiado.</Empty>
        ) : (
          <div className="sheet overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-rule text-ink-3">
                <tr>
                  <th className="px-4 py-3 font-[560]">Beneficiario</th>
                  <th className="px-4 py-3 font-[560]">Paga a</th>
                  <th className="px-4 py-3 font-[560]">Acuerdo vigente</th>
                  <th className="px-4 py-3 text-right font-[560]">Pagado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {payees.map((p) => (
                  <tr key={p.id} className={clsx(p.status === 'blocked' && 'opacity-70')}>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-[620] text-ink">{p.name}</p>
                      <p className="text-ink-3">
                        {p.legalName !== p.name ? `${p.legalName}, ` : ''}
                        {p.country}, {CATEGORY_LABELS[p.category]}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 align-top text-ink-2">
                      {payoutMethodLabel(p.destination.method)}{' '}
                      {maskDestination(p.destination.value)}
                    </td>
                    <td className="max-w-sm px-4 py-3.5 align-top">
                      {p.mandate ? (
                        <>
                          <p className="text-ink">{describeMandate(p.mandate.terms)}</p>
                          <p className="text-ink-3">
                            Versión {p.mandate.version},{' '}
                            {p.mandate.source === 'proposal' ? 'propuesta por el agente y ' : ''}
                            firmada por {p.mandate.signedBy.map((s) => s.name).join(' y ')}
                            {p.mandate.terms.autonomousLimitOverrideUsdCents
                              ? `, excepción hasta ${formatUsd(p.mandate.terms.autonomousLimitOverrideUsdCents)}`
                              : ''}
                          </p>
                        </>
                      ) : (
                        <ToneTag tone="pending" label="Sin acuerdo: todo pide aprobación" />
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right align-top text-ink">
                      <p className="tabular-nums">{formatUsd(p.stats.usdCents)}</p>
                      <p className="text-ink-3">{p.stats.paid} pagos</p>
                      {p.stats.escalated > 0 && (
                        <p className="text-ink-3">{p.stats.escalated} con aprobación</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right align-top">
                      {canSign && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                            Datos de pago
                          </Button>
                          {p.mandate && (
                            <Button size="sm" variant="ghost" onClick={() => revoke(p)}>
                              Revocar
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!canSign && (
          <p className="text-sm text-ink-3">
            Para cambiar datos de pago o revocar acuerdos, actúa como Martín o Sofía.
          </p>
        )}
      </section>
      {editing && <DestinationDialog payee={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
