'use client';

/**
 * «Mi empresa»: the profile OndAI reads to find references, score fit and write in the team's
 * voice. There is no server store for it yet: edits go to a local draft and «Guardar cambios»
 * keeps them in this browser. The server's fit and voice still use 30X's fixed profile, and the
 * page says so instead of implying otherwise.
 */
import {
  AlignLeft,
  Building2,
  Check,
  Globe,
  Lightbulb,
  Megaphone,
  Plus,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ChipList, SubLabel, TextField } from '@/components/empresa-fields';
import { Card, MonoLabel, PageHead } from '@/components/kit';
import { Page } from '@/components/shell';
import { Button } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useProfile, type CompanyProfile } from '@/lib/workspace';

/** «30X», or the initials of the first two words. */
function initials(name: string): string {
  const n = name.trim();
  if (!n) return '?';
  if (n.length <= 4) return n.toUpperCase();
  return n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

const REFERENCES_GOAL = 3;

/** What a complete profile has, and how to name what is missing. */
function completeness(p: CompanyProfile) {
  const filled = (s: string) => s.trim().length > 0;
  const parts: [boolean, string][] = [
    [filled(p.name), 'el nombre'],
    [filled(p.site), 'el sitio web'],
    [filled(p.industry), 'la industria'],
    [filled(p.topic), 'el tema que sigue OndAI'],
    [filled(p.about), 'qué hace la empresa'],
    [p.audience.length > 0, 'la audiencia'],
    [p.pillars.length > 0, 'los pilares'],
    [p.voice.length > 0, 'cómo suena la marca'],
    [p.avoid.length > 0, 'qué evitar'],
    [filled(p.example), 'un ejemplo de pieza que los represente'],
    [
      p.references.length >= REFERENCES_GOAL,
      `${REFERENCES_GOAL - p.references.length} ${
        REFERENCES_GOAL - p.references.length === 1 ? 'referente' : 'referentes'
      } más`,
    ],
    [p.watchLangs.length > 0, 'idiomas a vigilar'],
    [p.publishLangs.length > 0, 'idiomas de publicación'],
    [p.markets.length > 0, 'los mercados'],
  ];
  const missing = parts.filter(([ok]) => !ok).map(([, label]) => label);
  return { pct: Math.round(((parts.length - missing.length) / parts.length) * 100), missing };
}

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);

interface ServerProfile {
  url: string;
}

export default function EmpresaPage() {
  const [saved, save] = useProfile();
  const [draft, setDraft] = useState<CompanyProfile | null>(null);
  const p = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<CompanyProfile>) => setDraft({ ...p, ...patch });

  // The accounts the server already reads, to tell «Siguiendo» from a local addition.
  const { data: refs } = useApi<{ profiles: ServerProfile[] }>('/api/v1/references');
  const followed = (handle: string) => {
    const h = handle.replace(/^@/, '').toLowerCase();
    return !!h && !!refs?.profiles.some((r) => r.url.toLowerCase().includes(`/${h}/`));
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const onSave = () => {
    save(p);
    setDraft(null);
    toast('Perfil guardado en este navegador');
  };

  const { pct, missing } = completeness(p);

  return (
    <Page>
      <PageHead
        crumbs={[{ label: 'Configurar' }, { label: 'Mi empresa' }]}
        title="Perfil de la empresa"
        lead="OndAI usa este perfil para buscar referentes, calcular el encaje y escribir en tu voz."
        actions={
          <>
            {dirty && (
              <>
                <span className="text-[0.84rem] text-ink-3">Cambios sin guardar</span>
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Descartar
                </Button>
              </>
            )}
            <Button
              variant="primary"
              className="rounded-[10px]"
              icon={<Check className="size-4" strokeWidth={2.6} />}
              onClick={onSave}
            >
              Guardar cambios
            </Button>
          </>
        }
      />

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-5">
          {/* ---------------------------------------- la empresa */}
          <Card icon={<Building2 />} tone="orange" title="La empresa">
            <div className="grid gap-4">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-end gap-4 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)]">
                <span
                  className="grid size-16 place-items-center rounded-[14px] bg-ink text-[1.25rem] font-[800] tracking-[-0.02em] text-sheet"
                  aria-hidden
                >
                  {initials(p.name)}
                </span>
                <TextField
                  label="Nombre"
                  value={p.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
                <TextField
                  className="max-sm:col-span-2"
                  label="Sitio web"
                  value={p.site}
                  inputMode="url"
                  onChange={(e) => set({ site: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Industria"
                  value={p.industry}
                  onChange={(e) => set({ industry: e.target.value })}
                />
                <TextField
                  label="Tema que sigue OndAI"
                  value={p.topic}
                  onChange={(e) => set({ topic: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="empresa-about" className="text-[0.88rem] font-[600] text-ink">
                  Qué hace la empresa
                </label>
                <textarea
                  id="empresa-about"
                  rows={3}
                  value={p.about}
                  onChange={(e) => set({ about: e.target.value })}
                  className="w-full rounded-[10px] border border-rule bg-sheet px-3.5 py-2.5 text-[0.95rem] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
              </div>
            </div>
          </Card>

          {/* ---------------------------------------- audiencia y pilares */}
          <div className="grid gap-5 md:grid-cols-2">
            <Card icon={<Users />} tone="lavender" title="Audiencia">
              <ChipList
                items={p.audience}
                onChange={(audience) => set({ audience })}
                placeholder="Ej.: Gerentes de mercadeo"
              />
            </Card>
            <Card icon={<AlignLeft />} tone="green" title="Pilares de contenido">
              <ChipList
                items={p.pillars}
                onChange={(pillars) => set({ pillars })}
                placeholder="Ej.: Finanzas"
              />
            </Card>
          </div>

          {/* ---------------------------------------- voz */}
          <Card icon={<Megaphone />} tone="amber" title="Voz de marca">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <SubLabel>Así suena</SubLabel>
                <ChipList
                  items={p.voice}
                  onChange={(voice) => set({ voice })}
                  placeholder="Ej.: Práctica"
                />
              </div>
              <div>
                <SubLabel>Evitar</SubLabel>
                <ChipList
                  items={p.avoid}
                  onChange={(avoid) => set({ avoid })}
                  placeholder="Ej.: Tecnicismos"
                />
              </div>
            </div>
            <TextField
              className="mt-5"
              label="Ejemplo de una pieza que nos representa"
              value={p.example}
              placeholder="Un título o un enlace a una pieza que suene a ustedes"
              onChange={(e) => set({ example: e.target.value })}
            />
          </Card>

          {/* ---------------------------------------- referentes e idiomas */}
          <div className="grid items-start gap-5 md:grid-cols-2">
            <Card icon={<Star />} tone="orange" title="Referentes a seguir">
              <ul className="divide-y divide-rule">
                {p.references.map((r) => {
                  const on = followed(r.handle);
                  return (
                    <li key={r.handle} className="flex items-center gap-3 py-3 first:pt-0">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-fill text-[0.85rem] font-[700] text-ink"
                        aria-hidden
                      >
                        {r.handle.replace(/^@/, '').charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.94rem] font-[700] text-ink">{r.handle}</p>
                        {r.where && <p className="truncate text-[0.8rem] text-ink-2">{r.where}</p>}
                      </div>
                      {on ? (
                        <span
                          className="shrink-0 rounded-[6px] bg-st-emergente-tint px-2 py-[3px] text-[0.72rem] font-[700] text-st-emergente"
                          title="OndAI ya lee esta cuenta para el radar"
                        >
                          Siguiendo
                        </span>
                      ) : (
                        <span
                          className="shrink-0 rounded-[6px] border border-rule px-2 py-[3px] text-[0.72rem] font-[700] text-ink-3"
                          title="En esta demo OndAI solo lee las cuentas de 30X y Andrés Bilbao"
                        >
                          Pendiente
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          set({ references: p.references.filter((x) => x.handle !== r.handle) })
                        }
                        className="grid size-7 shrink-0 place-items-center rounded-full text-ink-3 transition hover:bg-fill hover:text-ink"
                        aria-label={`Quitar ${r.handle}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <AddAccount
                onAdd={(ref) => {
                  if (
                    !p.references.some((x) => x.handle.toLowerCase() === ref.handle.toLowerCase())
                  )
                    set({ references: [...p.references, ref] });
                }}
              />
            </Card>

            <Card icon={<Globe />} tone="lavender" title="Idiomas y mercados">
              <div className="grid gap-4">
                <div>
                  <SubLabel>Vigilar en</SubLabel>
                  <ChipList
                    items={p.watchLangs}
                    onChange={(watchLangs) => set({ watchLangs })}
                    addLabel="Idioma"
                  />
                </div>
                <div>
                  <SubLabel>Publicar en</SubLabel>
                  <ChipList
                    items={p.publishLangs}
                    onChange={(publishLangs) => set({ publishLangs })}
                    addLabel="Idioma"
                  />
                </div>
                <div>
                  <SubLabel>Mercados</SubLabel>
                  <ChipList
                    items={p.markets}
                    onChange={(markets) => set({ markets })}
                    addLabel="Mercado"
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ---------------------------------------- side */}
        <aside className="grid gap-5 lg:sticky lg:top-4">
          <section className="rounded-[14px] border border-marker/25 bg-gradient-to-bl from-marker/15 via-sheet to-sheet p-5">
            <div className="mb-4 flex items-center gap-2.5">
              <span
                className="grid size-8 place-items-center rounded-[8px] bg-sheet text-marker-strong"
                aria-hidden
              >
                <Lightbulb className="size-[1.05rem]" />
              </span>
              <h2 className="text-[1rem] font-[700] text-ink">Cómo usa esto OndAI</h2>
            </div>
            <div className="grid gap-3.5 text-[0.9rem] leading-snug text-ink">
              <p>
                <b className="font-[700]">Referentes.</b> Lee lo que publican para saber qué temas
                ya tocaron y cuáles siguen libres.
              </p>
              <p>
                <b className="font-[700]">Encaje 1-10.</b> Puntúa cada tema según la audiencia, los
                pilares y el mercado.
              </p>
              <p>
                <b className="font-[700]">Borradores.</b> Escribe en la voz de la marca y evita lo
                que está marcado como «Evitar».
              </p>
              <p className="border-t border-marker/20 pt-3 text-[0.82rem] text-ink-2">
                En esta demo el perfil se guarda en este navegador. El encaje y los borradores
                todavía usan el perfil fijo de 30X en el servidor.
              </p>
            </div>
          </section>

          <section className="rounded-[14px] border border-rule bg-sheet p-5">
            <MonoLabel>Perfil completo</MonoLabel>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-fill"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Perfil completo"
            >
              <div className="h-full rounded-full bg-marker" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-3 text-[0.85rem] text-ink-2">
              <span className="tabular-nums">{pct} %</span>
              {missing.length > 0
                ? ` · falta ${list(missing.slice(0, 2))}${missing.length > 2 ? ' y algo más' : ''}.`
                : ' · todo listo. Revísalo cuando cambie la estrategia.'}
            </p>
          </section>
        </aside>
      </div>
    </Page>
  );
}

/** «+ Agregar cuenta»: a handle and, optionally, where and who it is. */
function AddAccount({ onAdd }: { onAdd: (ref: { handle: string; where: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [where, setWhere] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const h = handle.trim();
    if (!h) return;
    onAdd({ handle: h.startsWith('@') || h.includes(' ') ? h : `@${h}`, where: where.trim() });
    setHandle('');
    setWhere('');
    setOpen(false);
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex h-8 items-center gap-1 rounded-[8px] border border-dashed border-rule-strong px-2.5 text-[0.88rem] text-ink-2 transition hover:border-ink-3 hover:text-ink"
      >
        <Plus className="size-3.5" aria-hidden />
        Agregar cuenta
      </button>
    );
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2">
      <input
        autoFocus
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="@cuenta"
        aria-label="Cuenta"
        className="h-9 rounded-[8px] border border-rule bg-sheet px-2.5 text-[0.9rem] text-ink outline-none focus:border-brand"
      />
      <input
        value={where}
        onChange={(e) => setWhere(e.target.value)}
        placeholder="Red · quién es (ej.: Instagram · referente PT)"
        aria-label="Red y rol"
        className="h-9 rounded-[8px] border border-rule bg-sheet px-2.5 text-[0.9rem] text-ink outline-none focus:border-brand"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" icon={<Plus className="size-3.5" />}>
          Agregar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
