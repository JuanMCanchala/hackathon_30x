/**
 * «La última búsqueda»: the Vigía funnel as label · bar · number, what reading the caught pieces
 * cost, what JEV did, and why the rest stayed out, with examples per rule.
 */
import clsx from 'clsx';
import { fmtInt } from '@/components/ui';
import { LangBadge } from '@/components/vigia-ui';
import type { WatchDetail, WatchReport, WatchStep } from '@/lib/types';

/** «USD 0,0023»: two significant figures for small amounts, three decimals otherwise. */
const usd = (n: number) =>
  `USD ${n.toLocaleString('es-CO', n > 0 && n < 0.01 ? { maximumSignificantDigits: 2 } : { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

const list = (items: string[]) => new Intl.ListFormat('es', { type: 'conjunction' }).format(items);
const either = (items: string[]) =>
  new Intl.ListFormat('es', { type: 'disjunction' }).format(items);

const SOURCE_COPY: Record<string, string> = {
  youtube: 'YouTube',
  bluesky: 'Bluesky',
  hn: 'Hacker News',
  instagram: 'Instagram',
};

const STEP_COPY: Record<WatchStep, string> = {
  encontradas: 'Encontradas',
  idioma: 'Idioma',
  tema: 'Tema',
  reciente: 'Recientes',
  viral: 'Virales',
  nuevo: 'Nuevas',
  presupuesto: 'Atrapadas',
};

/** Sand for the raw counts, lavender for topic and date, orange where it starts to matter. */
const BAR: Record<WatchStep, string> = {
  encontradas: 'bg-rule-strong',
  idioma: 'bg-rule-strong',
  tema: 'bg-lavender',
  reciente: 'bg-lavender',
  viral: 'bg-marker',
  nuevo: 'bg-marker',
  presupuesto: 'bg-marker',
};

const RULE_COPY: Record<WatchStep, string> = {
  encontradas: '',
  idioma: 'Otro idioma',
  tema: 'Fuera del tema',
  reciente: 'Muy viejas',
  viral: 'Sin tracción',
  nuevo: 'Ya atrapadas',
  presupuesto: 'Fuera del presupuesto',
};

function Funnel({ report, windowHours }: { report: WatchReport; windowHours: number }) {
  const max = Math.max(1, report.steps[0]?.left ?? 1);
  return (
    <ol className="grid gap-3">
      {report.steps.map((s) => (
        <li key={s.step} className="grid">
          {s.step === 'presupuesto' && (
            <div className="mb-3 flex items-center gap-2 font-mono text-[0.68rem] tracking-[0.06em] text-marker-strong uppercase">
              <span className="h-px flex-1 bg-marker/50" aria-hidden />
              Desde aquí se gastan tokens
              <span className="h-px flex-1 bg-marker/50" aria-hidden />
            </div>
          )}
          <div
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-x-3"
            title={s.step === 'reciente' ? `De las últimas ${windowHours} h` : undefined}
          >
            <span
              className={clsx(
                'text-[0.9rem]',
                s.step === 'presupuesto' ? 'font-[700] text-ink' : 'text-ink',
              )}
            >
              {STEP_COPY[s.step]}
            </span>
            <span className="h-6 overflow-hidden rounded-[6px] bg-sheet-2" aria-hidden>
              <span
                className={clsx('block h-full rounded-[6px]', BAR[s.step])}
                style={{ width: s.left > 0 ? `${Math.max(3, (s.left / max) * 100)}%` : 0 }}
              />
            </span>
            <span className="text-right text-[0.9rem] font-[700] text-ink tabular-nums">
              {fmtInt(s.left)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Costs({ report }: { report: WatchReport }) {
  const jev = report.jev;
  return (
    <div className="grid gap-1.5 text-[0.9rem] leading-relaxed text-ink">
      <p>
        Leer {report.caught === 1 ? 'la atrapada' : `las ${fmtInt(report.caught)}`} costó{' '}
        <span className="font-[700]">{usd(report.costUsd)}</span>
        <span className="text-ink-3">
          {' '}
          ({fmtInt(report.tokens.input + report.tokens.output)} tokens)
        </span>
        .
        {jev && !('skipped' in jev) && (
          <>
            {' '}
            Decidir tema y encaje de {fmtInt(jev.judged)} piezas tomó{' '}
            {(jev.ms / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} s por{' '}
            <span className="font-[700]">{usd(jev.costUsd)}</span>.
          </>
        )}
      </p>
      {jev && 'skipped' in jev && (
        <p className="text-[0.82rem] text-ink-3">
          Sin JEV en esta búsqueda ({jev.skipped}): el tema se decidió por palabras clave.
        </p>
      )}
    </div>
  );
}

function Rejections({ report }: { report: WatchReport }) {
  const stopped = report.rejected.filter((r) => r.count > 0);
  const searched = report.sources
    .filter((s) => s.source !== 'youtube-detalle')
    .reduce<Record<string, number>>((acc, s) => {
      acc[s.source] = (acc[s.source] ?? 0) + s.found;
      return acc;
    }, {});
  const opened = report.sources.find((s) => s.source === 'youtube-detalle')?.found ?? 0;
  const sources = Object.keys(searched).map((s) => SOURCE_COPY[s] ?? s);
  return (
    <div className="grid gap-2">
      <h3 className="text-[1rem] font-[700] text-ink">Por qué se quedaron afuera</h3>
      <p className="text-[0.86rem] leading-relaxed text-ink-2">
        {stopped.length > 0 &&
          `Por regla: ${either(stopped.map((r) => RULE_COPY[r.rule].toLowerCase()))}. `}
        {sources.length > 0 && `Buscó en ${list(sources)}.`}
        {opened > 0 &&
          ` Abrió ${fmtInt(opened)} videos de YouTube para leer su fecha, su canal y sus métricas.`}
      </p>
      {stopped.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[0.86rem] font-[650] text-brand max-lg:-my-2.5 max-lg:py-2.5">
            Ver ejemplos por regla
          </summary>
          <ul className="mt-3 grid gap-3">
            {stopped.map((r) => (
              <li key={r.rule} className="grid gap-1">
                <p className="text-[0.88rem] text-ink">
                  <span className="font-[700]">{RULE_COPY[r.rule]}</span>: {fmtInt(r.count)}
                </p>
                <ul className="grid gap-0.5 text-[0.82rem] text-ink-2">
                  {r.examples.map((e) => (
                    <li key={e.title} className="line-clamp-2">
                      «{e.title}». {e.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The right card: the last search of the followed topic. */
export function LastSearch({ detail }: { detail: WatchDetail }) {
  const { watch, run } = detail;
  const report = run?.report ?? null;
  return (
    <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 rounded-[14px] border border-rule bg-sheet p-5 md:max-xl:grid-cols-2 md:max-xl:items-start md:max-xl:gap-x-8 xl:sticky xl:top-20">
      <h2 className="text-[1rem] font-[700] text-ink md:max-xl:col-span-2">La última búsqueda</h2>
      {report ? (
        <>
          <Funnel report={report} windowHours={watch.windowHours} />
          {/* Stacked under the list on a tablet, the funnel and the reading sit side by side. */}
          <div className="contents md:max-xl:grid md:max-xl:gap-5">
            <Costs report={report} />
            <Rejections report={report} />
          </div>
        </>
      ) : run?.error ? (
        <p className="text-[0.9rem] text-ink-2 md:max-xl:col-span-2">
          La búsqueda falló: {run.error}
        </p>
      ) : (
        <p className="text-[0.9rem] text-ink-2 md:max-xl:col-span-2">
          {watch.running ? 'La búsqueda está en curso.' : 'Todavía no hay una búsqueda.'}
        </p>
      )}
      <div className="grid gap-1.5 border-t border-rule pt-4 text-[0.8rem] text-ink-3 md:max-xl:col-span-2">
        <p>Busca en inglés (desde Estados Unidos e India) y en portugués:</p>
        {watch.langs.map((l) => (
          <p key={l} className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <LangBadge lang={l} />
            <span>{(watch.plan[l]?.queries ?? []).map((q) => `«${q}»`).join(', ')}</span>
          </p>
        ))}
      </div>
    </aside>
  );
}
