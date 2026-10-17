'use client';

import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSWRConfig } from 'swr';
import { formatPeriodMonth } from '@mandato/domain';
import {
  Button,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
  ToneTag,
  fmtDay,
} from '@/components/ui';
import { ApiError, post, put } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { OUTCOME_COPY, toneOfOutcome } from '@/lib/outcomes';
import { useSession } from '@/lib/session';
import type { PolicyPreview, PolicyTerms, PolicyView, RuleMeta } from '@/lib/types';

const CURRENCIES = ['USD', 'COP', 'MXN', 'BRL', 'PEN', 'ARS'];

interface FormState {
  limit: string;
  dual: string;
  budget: string;
  confidence: string;
  window: string;
  age: string;
  terms: string;
  currencies: string[];
  rates: Record<string, string>;
}

const usd = (cents: number) => String(cents / 100);

function toForm(t: PolicyTerms): FormState {
  return {
    limit: usd(t.autonomousLimitUsdCents),
    dual: usd(t.dualApprovalAboveUsdCents),
    budget: usd(t.monthlyBudgetUsdCents),
    confidence: String(Math.round(t.minExtractionConfidence * 100)),
    window: String(t.duplicateWindowDays),
    age: String(t.maxInvoiceAgeDays),
    terms: String(t.defaultPaymentTermsDays),
    currencies: [...t.allowedCurrencies],
    rates: { ...t.fx.unitsPerUsd },
  };
}

function toTerms(f: FormState, base: PolicyTerms): PolicyTerms {
  const cents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);
  return {
    ...base,
    autonomousLimitUsdCents: cents(f.limit),
    dualApprovalAboveUsdCents: cents(f.dual),
    monthlyBudgetUsdCents: cents(f.budget),
    minExtractionConfidence: Number(f.confidence) / 100,
    duplicateWindowDays: Number(f.window),
    maxInvoiceAgeDays: Number(f.age),
    defaultPaymentTermsDays: Number(f.terms),
    allowedCurrencies: f.currencies,
    fx: {
      ...base.fx,
      unitsPerUsd: Object.fromEntries(Object.entries(f.rates).filter(([, v]) => v.trim() !== '')),
    },
  };
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-14"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-3">
          {suffix}
        </span>
      </div>
    </Field>
  );
}

const STAGE_TITLES: Record<string, string> = {
  reading: 'Lectura',
  payee: 'Beneficiario',
  duplicate: 'Duplicados',
  mandate: 'Acuerdo firmado',
  policy: 'Política y saldo',
  requester: 'Quién la pide',
};

export default function ReglasPage() {
  const { session } = useSession();
  const { mutate } = useSWRConfig();
  const { data: policy } = useApi<PolicyView>('/api/v1/policy');
  const { data: catalog } = useApi<RuleMeta[]>('/api/v1/rules');
  // Untouched, the form mirrors the stored policy; editing it starts a draft.
  const [draft, setDraft] = useState<FormState | null>(null);
  const [previewResult, setPreview] = useState<PolicyPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState('');
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState<{ explanation: string; unsupported: string[] } | null>(
    null,
  );

  const form = useMemo(() => draft ?? (policy ? toForm(policy.terms) : null), [draft, policy]);
  const proposed = useMemo(
    () => (form && policy ? toTerms(form, policy.terms) : null),
    [form, policy],
  );
  const dirty = Boolean(
    policy && proposed && JSON.stringify(toForm(policy.terms)) !== JSON.stringify(form),
  );

  const preview = dirty ? previewResult : null;

  useEffect(() => {
    if (!proposed || !dirty) return;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(await post<PolicyPreview>('/api/v1/policy/preview', { terms: proposed }));
      } catch (error) {
        setPreview(null);
        if (error instanceof ApiError && error.status !== 400) toast.error(error.message);
      } finally {
        setPreviewing(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [proposed, dirty]);

  if (!policy || !form || !proposed) return <Skeleton className="h-[600px]" />;
  const set = (patchState: Partial<FormState>) => setDraft({ ...form, ...patchState });

  const save = async () => {
    setSaving(true);
    try {
      await put('/api/v1/policy', { terms: proposed, note: note || null });
      toast('Política guardada', {
        description: 'Las próximas facturas se deciden con la versión nueva.',
      });
      setDraft(null);
      setNote('');
      setCompiled(null);
      void mutate(() => true);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const compile = async () => {
    setCompiling(true);
    try {
      const result = await post<{
        patch: { explanation: string; unsupported: string[] };
        terms: PolicyTerms;
        preview: PolicyPreview;
      }>('/api/v1/policy/compile', { text });
      setDraft(toForm(result.terms));
      setCompiled({ explanation: result.patch.explanation, unsupported: result.patch.unsupported });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'No pude convertir ese texto en una regla.',
      );
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="grid gap-12">
      <PageHeader
        title="Reglas"
        lead="Los límites de la empresa. Antes de guardar un cambio, el agente lo prueba contra todo el historial y te muestra qué habría decidido distinto."
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className="sheet grid gap-6 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="t-h3 text-ink">Política vigente, versión {policy.version}</h2>
            <span className="text-sm text-ink-3">desde el {fmtDay(policy.createdAt)}</span>
          </div>

          <div className="grid gap-2 rounded-xl border border-dashed border-rule-strong p-4">
            <label htmlFor="nl" className="flex items-center gap-2 text-sm font-[620] text-ink">
              <Sparkles className="size-4 text-brand" aria-hidden /> Escríbelo en español
            </label>
            <Textarea
              id="nl"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Por ejemplo: «sube el límite a 6 mil dólares y que los pagos de más de 12 mil necesiten dos firmas»"
              disabled={!session?.policyCompiler}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-ink-3">
                {session?.policyCompiler
                  ? 'El modelo de lenguaje lo convierte en cambios concretos; tú los revisas y decides si guardar.'
                  : 'Disponible cuando el servidor tiene un modelo de lenguaje configurado.'}
              </p>
              <Button
                size="sm"
                onClick={compile}
                loading={compiling}
                disabled={!session?.policyCompiler || text.trim().length < 5}
              >
                Convertir en regla
              </Button>
            </div>
            {compiled && (
              <div className="mt-1 grid gap-1 text-sm">
                <p className="voice text-ink">{compiled.explanation}</p>
                {compiled.unsupported.map((u) => (
                  <p key={u} className="text-ink-2">
                    No lo puedo expresar como regla verificable: {u}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <NumberField
              id="limit"
              label="Límite por pago sin aprobación"
              value={form.limit}
              onChange={(v) => set({ limit: v })}
              suffix="USD"
            />
            <NumberField
              id="dual"
              label="Doble aprobación por encima de"
              value={form.dual}
              onChange={(v) => set({ dual: v })}
              suffix="USD"
            />
            <NumberField
              id="budget"
              label="Presupuesto mensual"
              value={form.budget}
              onChange={(v) => set({ budget: v })}
              suffix="USD"
            />
            <NumberField
              id="conf"
              label="Confianza mínima de lectura"
              value={form.confidence}
              onChange={(v) => set({ confidence: v })}
              suffix="%"
            />
            <NumberField
              id="window"
              label="Ventana de cobros repetidos"
              value={form.window}
              onChange={(v) => set({ window: v })}
              suffix="días"
            />
            <NumberField
              id="age"
              label="Antigüedad máxima de una factura"
              value={form.age}
              onChange={(v) => set({ age: v })}
              suffix="días"
            />
            <NumberField
              id="terms"
              label="Plazo si no dice vencimiento"
              value={form.terms}
              onChange={(v) => set({ terms: v })}
              suffix="días"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-[600] text-ink">
              Monedas en que paga la empresa
            </legend>
            <div className="flex flex-wrap gap-2">
              {CURRENCIES.map((c) => {
                const on = form.currencies.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        currencies: on
                          ? form.currencies.filter((x) => x !== c)
                          : [...form.currencies, c],
                        rates: on || form.rates[c] ? form.rates : { ...form.rates, [c]: '' },
                      })
                    }
                    className={clsx(
                      'rounded-full border px-3 py-1 text-sm',
                      on
                        ? 'border-brand bg-brand-tint font-[620] text-ink'
                        : 'border-rule-strong text-ink-2 hover:text-ink',
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-[600] text-ink">
              Tasas de referencia (unidades por 1 USD)
            </legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {form.currencies
                .filter((c) => c !== 'USD')
                .map((c) => (
                  <Field key={c} label={c} htmlFor={`rate-${c}`}>
                    <Input
                      id={`rate-${c}`}
                      inputMode="decimal"
                      value={form.rates[c] ?? ''}
                      onChange={(e) => set({ rates: { ...form.rates, [c]: e.target.value } })}
                    />
                  </Field>
                ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              {policy.terms.fx.source}. Para comparar con los límites se redondea hacia arriba.
            </p>
          </fieldset>
        </section>

        <section className="grid gap-4 lg:sticky lg:top-20">
          <div className="sheet grid gap-4 p-6">
            <h2 className="t-h3 text-ink">Qué habría pasado</h2>
            {!dirty ? (
              <p className="text-ink-2">
                Cambia un valor y verás aquí qué facturas del historial se habrían decidido
                distinto.
              </p>
            ) : previewing && !preview ? (
              <Skeleton className="h-32" />
            ) : preview ? (
              <>
                <ul className="grid gap-1 text-sm">
                  {preview.policyChanges.map((c) => (
                    <li key={c.label} className="text-ink">
                      {c.label}: <span className="text-ink-3 line-through">{c.from}</span>{' '}
                      <span className="font-[620]">{c.to}</span>
                    </li>
                  ))}
                </ul>
                <p className="voice text-ink">
                  {preview.changes.length === 0
                    ? `Con estas reglas, las ${preview.evaluated} facturas del historial se habrían decidido igual.`
                    : `De ${preview.evaluated} facturas, ${preview.changes.length} se habrían decidido distinto: ${preview.becomesPay} se pagarían solas, ${preview.becomesEscalate} pedirían aprobación y ${preview.becomesHold} se frenarían.`}
                </p>
                {preview.changes.length > 0 && (
                  <ul className="max-h-80 divide-y divide-rule overflow-y-auto rounded-lg border border-rule">
                    {preview.changes.map((c) => (
                      <li key={c.invoiceId} className="grid gap-1 px-3.5 py-2.5 text-sm">
                        <Link
                          href={`/facturas/${c.invoiceId}`}
                          className="font-[600] text-ink hover:text-brand"
                        >
                          {c.ref}, {c.title ?? ''}
                        </Link>
                        <span className="flex flex-wrap items-center gap-2">
                          <ToneTag
                            tone={toneOfOutcome(c.from)}
                            label={OUTCOME_COPY[c.from].short}
                          />
                          <span className="text-ink-3">pasaría a</span>
                          <ToneTag tone={toneOfOutcome(c.to)} label={OUTCOME_COPY[c.to].short} />
                          <span className="text-ink-3">{formatPeriodMonth(c.periodKey)}</span>
                        </span>
                        <span className="text-ink-2">{c.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {session?.user.canSign ? (
                  <div className="grid gap-2">
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Motivo del cambio (queda en el registro)"
                      aria-label="Motivo"
                    />
                    <div className="flex gap-2">
                      <Button variant="primary" onClick={save} loading={saving}>
                        Guardar versión {policy.version + 1}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setDraft(null);
                          setCompiled(null);
                        }}
                      >
                        Descartar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink-3">
                    Solo Martín o Sofía pueden guardar cambios en la política.
                  </p>
                )}
                <p className="text-xs text-ink-3">
                  Se evalúa cada factura con los beneficiarios y acuerdos de hoy, cambiando solo la
                  política. Ninguna regla nueva puede pagar algo fuera de un acuerdo firmado.
                </p>
              </>
            ) : (
              <p className="text-sm text-held">Revisa los valores: la política no es válida.</p>
            )}
          </div>

          <details className="sheet p-6">
            <summary className="cursor-pointer t-h3 text-ink">Historial de versiones</summary>
            <ol className="mt-3 grid gap-2 text-sm">
              {policy.versions.map((v) => (
                <li key={v.version} className="flex justify-between gap-3">
                  <span className="text-ink">
                    Versión {v.version}
                    {v.note ? `: ${v.note}` : ''}
                  </span>
                  <span className="shrink-0 text-ink-3">{fmtDay(v.createdAt)}</span>
                </li>
              ))}
            </ol>
          </details>
        </section>
      </div>

      <section>
        <h2 className="t-h2 mb-2 text-ink">Las 23 reglas del motor</h2>
        <p className="mb-5 max-w-2xl text-ink-2">
          Se evalúan todas, en este orden, para cada factura. Si una no se cumple, el agente frena
          el pago o pide aprobación; solo paga cuando todas se cumplen.
        </p>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(STAGE_TITLES).map(([stage, title]) => (
            <div key={stage}>
              <p className="mb-2 font-[650] text-ink">{title}</p>
              <ul className="grid gap-1.5 text-sm">
                {catalog
                  ?.filter((r) => r.stage === stage)
                  .map((r) => (
                    <li key={r.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-ink-2">{r.title}</span>
                      <span className="shrink-0 text-xs text-ink-3">
                        {r.onFail === 'HOLD' ? 'frena' : 'pide aprobación'}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
