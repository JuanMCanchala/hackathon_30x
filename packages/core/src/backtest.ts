/**
 * The backtest: would the radar have seen the 2025–2026 AI waves coming? It replays the same
 * detector week by week over public history, using only what was known each week, and compares
 * the first signal with the week each wave peaked. Stable topics are the control: any signal on
 * them is a false alarm.
 *
 * History here is volume (Wikipedia page views, Hacker News stories, Bluesky posts), not distinct
 * creators. Volume stands in for creators, with the same lift formula and the same thresholds as
 * the live radar (growth.ts); nothing is tuned to these series. The report also gives the same
 * rule with a Poisson burst check on top of the lift (BURST_P, after Kleinberg 2002), for
 * comparison only: it does not decide detection.
 */
import {
  addWeeks,
  BASELINE_WEEKS,
  BURST_P,
  burstAt,
  daysBetween,
  liftAt,
  MIN_CREATORS,
  SIGNAL_LIFT,
  weekOf,
} from './growth';
import { median } from './stats';
import type { Point } from './types';

export type BacktestSource = 'wikipedia' | 'hn' | 'bluesky';

/** Mainstream first: a wave's peak is read from the most mainstream source it has. */
export const PEAK_PREFERENCE: readonly BacktestSource[] = ['wikipedia', 'bluesky', 'hn'];

/**
 * The first week each source may fire. Four weeks of baseline after the window opens; for
 * Bluesky, after the surge of new users of late 2024 had settled, so that platform growth is not
 * mistaken for topic growth.
 */
export const EVALUATE_FROM: Record<BacktestSource, string> = {
  wikipedia: '2024-11-04',
  hn: '2024-11-04',
  bluesky: '2025-01-06',
};

/** A wave's run-up: its first signal within the 12 weeks up to the peak is when the radar saw it. */
export const RUNUP_WEEKS = 12;

/**
 * Where a wave's peak is looked for, around its public event: from 4 weeks before to 8 after.
 * A topic can have several waves (Manus launched in March 2025 and was bought in December); the
 * one evaluated is the one named.
 */
export const PEAK_WINDOW = { before: 4, after: 8 } as const;

/**
 * How a topic signals. «confirmed»: two sources signal within CONFIRM_WEEKS of each other, the
 * cross-platform validation listening suites use to tell a wave from noise. «any»: one source
 * is enough; more sensitive, and noisier on small counts. The gate is judged on «confirmed»; the
 * report also gives «any» so the trade-off is visible.
 */
export type DetectionRule = 'confirmed' | 'any';

/** Two sources must signal within this many weeks (the later one's week included). */
export const CONFIRM_WEEKS = 4;

/** `pnpm eval` fails below this share of waves detected or above this share of false alarms. */
export const GATE = { minDetectionRate: 0.7, maxFalseAlarmRate: 0.3 } as const;

export interface WaveSpec {
  id: string;
  name: string;
  kind: 'wave' | 'control';
  /** Waves: the public launch or viral date (YYYY-MM-DD). */
  event?: string;
  note?: string;
  wikipedia?: { lang: string; article: string }[];
  hn?: string;
  bluesky?: string;
}

export interface WavesFile {
  description?: string;
  window: { from: string; to: string };
  topics: WaveSpec[];
}

/** One topic's history, as `scripts/fetch-backtest.ts` saves it. */
export interface BacktestSeriesFile {
  id: string;
  name: string;
  kind: 'wave' | 'control';
  /** Copied from waves.json: the wave's public event date. */
  event?: string;
  weeks: number;
  fetchedAt?: string;
  wikipedia?: { articles: { lang: string; title: string }[]; weekly: Point[] };
  hn?: { query: string; weekly: Point[] };
  bluesky?: { query: string; weekly: Point[] };
}

export interface SourceTrace {
  source: BacktestSource;
  /** Every week the source raised a signal, from its first evaluable week. */
  signalWeeks: string[];
  peakWeek: string | null;
  peakValue: number;
}

export interface WaveResult {
  id: string;
  name: string;
  note?: string;
  event: string | null;
  peakWeek: string | null;
  peakSource: BacktestSource | null;
  /** The first signal in the run-up under the report's rule. */
  detectedWeek: string | null;
  /** The sources behind that signal. */
  detectedBy: BacktestSource[];
  /** Days from the detection to the peak; 0 when it fired the week of the peak. */
  leadDays: number | null;
  /** A signal in the run-up, at the latest the week of the peak. */
  detected: boolean;
  /** A signal strictly before the week of the peak. */
  early: boolean;
  /** Wikipedia's peak minus Hacker News' peak: positive when the technical lane peaked first. */
  hnToWikipediaPeakDays: number | null;
  /** Wikipedia's first run-up signal minus Hacker News': positive when HN moved first. */
  hnToWikipediaSignalDays: number | null;
  sources: SourceTrace[];
}

export interface ControlResult {
  id: string;
  name: string;
  falseAlarm: boolean;
  /** Each week the control signaled under the report's rule, with the sources behind it. */
  alarms: { week: string; sources: BacktestSource[] }[];
  sources: SourceTrace[];
}

export interface BacktestSummary {
  waves: number;
  detected: number;
  early: number;
  detectionRate: number;
  medianLeadDays: number | null;
  controls: number;
  falseAlarms: number;
  falseAlarmRate: number;
  medianHnToWikipediaPeakDays: number | null;
  medianHnToWikipediaSignalDays: number | null;
}

export interface BacktestReport {
  rule: DetectionRule;
  params: {
    signalLift: number;
    minVolume: number;
    baselineWeeks: number;
    runupWeeks: number;
    evaluateFrom: Record<BacktestSource, string>;
    confirmWeeks: number;
    burstP: number;
  };
  /** Sources measured on every control, the only ones used, so waves and controls are judged alike. */
  sources: BacktestSource[];
  waves: WaveResult[];
  controls: ControlResult[];
  summary: BacktestSummary;
  /** The same backtest under the other rule, for comparison. */
  alternatives: { rule: DetectionRule; summary: BacktestSummary }[];
  /** The same rule when each signal must also pass the Poisson burst check (BURST_P). */
  withBurst: BacktestSummary;
  passed: boolean;
}

/**
 * The weeks in which a series raises a signal, judged as of each week: only the previous
 * `BASELINE_WEEKS` feed the baseline, so there is no look-ahead. With `maxBurstP`, a week also
 * needs its Poisson tail (burstAt) below it; by default that check is off.
 */
export function signalWeeks(points: readonly Point[], from = '', maxBurstP = Infinity): string[] {
  const values = points.map((p) => p.value);
  const weeks: string[] = [];
  for (let i = BASELINE_WEEKS; i < points.length; i += 1) {
    const week = points[i]!.date;
    if (week < from) continue;
    if (
      liftAt(values, i) >= SIGNAL_LIFT &&
      values[i]! >= MIN_CREATORS &&
      burstAt(values, i) < maxBurstP
    )
      weeks.push(week);
  }
  return weeks;
}

/**
 * The first week with the highest value, within [from, to] when given; null for an empty or
 * all-zero stretch.
 */
export function peakOf(
  points: readonly Point[],
  from = '',
  to = '9999-12-31',
): { week: string | null; value: number } {
  let best: Point | null = null;
  for (const p of points) {
    if (p.date < from || p.date > to) continue;
    if (!best || p.value > best.value) best = p;
  }
  return best && best.value > 0 ? { week: best.date, value: best.value } : { week: null, value: 0 };
}

function seriesOf(file: BacktestSeriesFile, source: BacktestSource): Point[] | undefined {
  return file[source]?.weekly;
}

function trace(
  file: BacktestSeriesFile,
  source: BacktestSource,
  maxBurstP: number,
): SourceTrace | null {
  const points = seriesOf(file, source);
  if (!points?.length) return null;
  const event = file.kind === 'wave' && file.event ? weekOf(file.event) : null;
  const peak = event
    ? peakOf(points, addWeeks(event, -PEAK_WINDOW.before), addWeeks(event, PEAK_WINDOW.after))
    : peakOf(points);
  return {
    source,
    signalWeeks: signalWeeks(points, EVALUATE_FROM[source], maxBurstP),
    peakWeek: peak.week,
    peakValue: peak.value,
  };
}

/**
 * The weeks a topic signals under `rule`, each with the sources behind it. Under «confirmed», a
 * week counts when at least two sources signaled in it or in the CONFIRM_WEEKS − 1 weeks before.
 */
export function topicSignals(
  traces: readonly SourceTrace[],
  rule: DetectionRule,
): { week: string; sources: BacktestSource[] }[] {
  const weeks = [...new Set(traces.flatMap((t) => t.signalWeeks))].sort();
  const out: { week: string; sources: BacktestSource[] }[] = [];
  for (const week of weeks) {
    const from = addWeeks(week, -(CONFIRM_WEEKS - 1));
    const window = rule === 'any' ? [week, week] : [from, week];
    const sources = traces
      .filter((t) => t.signalWeeks.some((w) => w >= window[0]! && w <= window[1]!))
      .map((t) => t.source)
      .sort();
    if (sources.length >= (rule === 'any' ? 1 : 2)) out.push({ week, sources });
  }
  return out;
}

/** The run-up to `peak`: from RUNUP_WEEKS − 1 weeks before it to the peak itself. */
const inRunup = (week: string, peak: string) =>
  week >= addWeeks(peak, -(RUNUP_WEEKS - 1)) && week <= peak;

export function evaluateWave(
  file: BacktestSeriesFile,
  sources: readonly BacktestSource[],
  rule: DetectionRule = 'confirmed',
  maxBurstP = Infinity,
): WaveResult {
  const traces = sources
    .map((s) => trace(file, s, maxBurstP))
    .filter((t): t is SourceTrace => t !== null);
  const bySource = new Map(traces.map((t) => [t.source, t]));
  const peakSource = PEAK_PREFERENCE.find((s) => bySource.get(s)?.peakWeek) ?? null;
  const peakWeek = peakSource ? bySource.get(peakSource)!.peakWeek : null;
  const first = peakWeek
    ? topicSignals(traces, rule).find((s) => inRunup(s.week, peakWeek))
    : undefined;

  const firstOf = (t: SourceTrace | undefined) =>
    peakWeek && t ? (t.signalWeeks.find((w) => inRunup(w, peakWeek)) ?? null) : null;
  const hn = bySource.get('hn');
  const wiki = bySource.get('wikipedia');
  const hnSignal = firstOf(hn);
  const wikiSignal = firstOf(wiki);

  return {
    id: file.id,
    name: file.name,
    event: file.event ?? null,
    peakWeek,
    peakSource,
    detectedWeek: first?.week ?? null,
    detectedBy: first?.sources ?? [],
    leadDays: first && peakWeek ? daysBetween(first.week, peakWeek) : null,
    detected: first !== undefined,
    early: first !== undefined && peakWeek !== null && first.week < peakWeek,
    hnToWikipediaPeakDays:
      hn?.peakWeek && wiki?.peakWeek ? daysBetween(hn.peakWeek, wiki.peakWeek) : null,
    hnToWikipediaSignalDays: hnSignal && wikiSignal ? daysBetween(hnSignal, wikiSignal) : null,
    sources: traces,
  };
}

export function evaluateControl(
  file: BacktestSeriesFile,
  sources: readonly BacktestSource[],
  rule: DetectionRule = 'confirmed',
  maxBurstP = Infinity,
): ControlResult {
  const traces = sources
    .map((s) => trace(file, s, maxBurstP))
    .filter((t): t is SourceTrace => t !== null);
  const alarms = topicSignals(traces, rule);
  return { id: file.id, name: file.name, falseAlarm: alarms.length > 0, alarms, sources: traces };
}

/** Sources present on every control and on at least one wave. */
export function usableSources(files: readonly BacktestSeriesFile[]): BacktestSource[] {
  const controls = files.filter((f) => f.kind === 'control');
  const waves = files.filter((f) => f.kind === 'wave');
  return (['wikipedia', 'hn', 'bluesky'] as const).filter(
    (s) =>
      controls.length > 0 &&
      controls.every((c) => seriesOf(c, s)?.length) &&
      waves.some((w) => seriesOf(w, s)?.length),
  );
}

const medianOrNull = (values: number[]) => (values.length ? median(values) : null);

function summarize(
  waves: readonly WaveResult[],
  controls: readonly ControlResult[],
): BacktestSummary {
  const detected = waves.filter((w) => w.detected);
  const falseAlarms = controls.filter((c) => c.falseAlarm).length;
  return {
    waves: waves.length,
    detected: detected.length,
    early: waves.filter((w) => w.early).length,
    detectionRate: waves.length ? detected.length / waves.length : 0,
    medianLeadDays: medianOrNull(detected.map((w) => w.leadDays!)),
    controls: controls.length,
    falseAlarms,
    falseAlarmRate: controls.length ? falseAlarms / controls.length : 0,
    medianHnToWikipediaPeakDays: medianOrNull(
      waves.flatMap((w) => (w.hnToWikipediaPeakDays === null ? [] : [w.hnToWikipediaPeakDays])),
    ),
    medianHnToWikipediaSignalDays: medianOrNull(
      waves.flatMap((w) => (w.hnToWikipediaSignalDays === null ? [] : [w.hnToWikipediaSignalDays])),
    ),
  };
}

function evaluateAll(
  files: readonly BacktestSeriesFile[],
  sources: readonly BacktestSource[],
  rule: DetectionRule,
  maxBurstP = Infinity,
) {
  const sorted = [...files].sort((a, b) => a.id.localeCompare(b.id));
  const waves = sorted
    .filter((f) => f.kind === 'wave')
    .map((f) => evaluateWave(f, sources, rule, maxBurstP))
    .filter((w) => w.sources.length > 0);
  const controls = sorted
    .filter((f) => f.kind === 'control')
    .map((f) => evaluateControl(f, sources, rule, maxBurstP));
  return { waves, controls, summary: summarize(waves, controls) };
}

export function runBacktest(
  files: readonly BacktestSeriesFile[],
  options: { sources?: readonly BacktestSource[]; rule?: DetectionRule } = {},
): BacktestReport {
  const sources = [...(options.sources ?? usableSources(files))];
  const rule = options.rule ?? 'confirmed';
  const main = evaluateAll(files, sources, rule);
  const other: DetectionRule = rule === 'confirmed' ? 'any' : 'confirmed';
  const s = main.summary;
  return {
    rule,
    params: {
      signalLift: SIGNAL_LIFT,
      minVolume: MIN_CREATORS,
      baselineWeeks: BASELINE_WEEKS,
      runupWeeks: RUNUP_WEEKS,
      evaluateFrom: EVALUATE_FROM,
      confirmWeeks: CONFIRM_WEEKS,
      burstP: BURST_P,
    },
    sources,
    waves: main.waves,
    controls: main.controls,
    summary: s,
    alternatives: [{ rule: other, summary: evaluateAll(files, sources, other).summary }],
    withBurst: evaluateAll(files, sources, rule, BURST_P).summary,
    passed:
      s.waves > 0 &&
      s.detectionRate >= GATE.minDetectionRate &&
      s.falseAlarmRate <= GATE.maxFalseAlarmRate,
  };
}

const SOURCE_NAME: Record<BacktestSource, string> = {
  wikipedia: 'Wikipedia',
  hn: 'Hacker News',
  bluesky: 'Bluesky',
};

const pct = (x: number) => `${Math.round(x * 100)} %`;
const days = (d: number) =>
  `${String(Math.round(d * 10) / 10).replace('.', ',')} ${Math.abs(d) === 1 ? 'día' : 'días'}`;

const RULE_NAME: Record<DetectionRule, string> = {
  confirmed: 'dos fuentes que coinciden',
  any: 'una sola fuente',
};

/** The report in a few Spanish lines, for the console and for the evaluation screen. */
export function describeBacktest(report: BacktestReport): string[] {
  const s = report.summary;
  const lines = [
    `Fuentes: ${report.sources.map((x) => SOURCE_NAME[x]).join(', ') || 'ninguna'}. Señal con ${RULE_NAME[report.rule]}.`,
    `Olas detectadas a tiempo (en su subida, a más tardar la semana del pico): ${s.detected} de ${s.waves} (${pct(s.detectionRate)}); ${s.early} antes de la semana del pico.`,
    s.medianLeadDays === null
      ? 'Anticipación mediana: sin olas detectadas.'
      : `Anticipación mediana: ${days(s.medianLeadDays)} antes del pico.`,
    `Falsas alarmas en temas estables: ${s.falseAlarms} de ${s.controls} (${pct(s.falseAlarmRate)}).`,
  ];
  for (const alt of report.alternatives) {
    const a = alt.summary;
    lines.push(
      `Con ${RULE_NAME[alt.rule]}: ${a.detected} de ${a.waves} olas a tiempo, anticipación mediana de ${a.medianLeadDays === null ? '—' : days(a.medianLeadDays)}, y ${a.falseAlarms} de ${a.controls} temas estables con falsa alarma.`,
    );
  }
  const wb = report.withBurst;
  lines.push(
    `Con la prueba de Poisson además del lift (p < ${String(report.params.burstP).replace('.', ',')}): ${wb.detected} de ${wb.waves} olas a tiempo, anticipación mediana de ${wb.medianLeadDays === null ? '—' : days(wb.medianLeadDays)}, y ${wb.falseAlarms} de ${wb.controls} temas estables con falsa alarma.`,
  );
  if (s.medianHnToWikipediaSignalDays !== null) {
    lines.push(
      `Hacker News se movió ${days(s.medianHnToWikipediaSignalDays)} antes que Wikipedia (mediana de la primera señal de cada una).`,
    );
  }
  if (s.medianHnToWikipediaPeakDays !== null) {
    lines.push(
      `Desfase mediano entre el pico en Hacker News y el pico en Wikipedia: ${days(s.medianHnToWikipediaPeakDays)}.`,
    );
  }
  lines.push(report.passed ? 'Resultado: pasa la compuerta.' : 'Resultado: NO pasa la compuerta.');
  return lines;
}
