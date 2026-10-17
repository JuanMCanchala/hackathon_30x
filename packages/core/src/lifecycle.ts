/**
 * Where a topic is in its wave. Rules in a fixed order, first match wins, so every topic gets
 * exactly one stage and the reason can be said in one sentence. Percentiles are taken across the
 * topics active this week, as BERTrend separates noise, weak and strong signals.
 *
 * Saturation is more voices for less attention: when supply grows, engagement per piece falls
 * (in TikTok, videos grew 72 % in a year while views fell 31 %; Metricool, 2026).
 */
import { isSignal, liftAt, MIN_CREATORS, SIGNAL_LIFT } from './growth';
import { percentile } from './stats';

export type Stage = 'emerging' | 'growing' | 'saturated' | 'declining' | 'stable';

export const STAGES: readonly Stage[] = ['emerging', 'growing', 'saturated', 'declining', 'stable'];

export const STAGE_LABEL: Record<Stage, string> = {
  emerging: 'Emergente',
  growing: 'En crecimiento',
  saturated: 'Saturado',
  declining: 'En declive',
  stable: 'Estable',
};

/** Below this lift a topic is no longer growing. */
export const FLAT_LIFT = 1.2;
/** Engagement per piece this far below its best week, with no growth, reads as saturation. */
export const ENGAGEMENT_DROP = 0.2;

export interface StageContext {
  /** Percentiles of this week's creators across active topics. */
  p10: number;
  p50: number;
  p90: number;
}

/**
 * Fewer active topics than this and nobody counts as «in the top 10 %»: with five topics the
 * 90th percentile is simply the biggest one, which would call every week's leader saturated.
 */
export const MIN_TOPICS_FOR_SATURATION = 10;

/**
 * Percentiles of the current week's creators among topics with a real conversation this week
 * (at least MIN_CREATORS). Counting the long tail of one-voice topics would put the 90th
 * percentile at two or three creators and call almost anything "saturated".
 */
export function stageContext(currentCreators: readonly number[]): StageContext {
  const active = currentCreators.filter((c) => c >= MIN_CREATORS);
  return {
    p10: percentile(active, 10),
    p50: percentile(active, 50),
    p90: active.length >= MIN_TOPICS_FOR_SATURATION ? percentile(active, 90) : Infinity,
  };
}

export interface StageInput {
  /** Distinct creators per week, oldest first; the last value is the current week. */
  creators: readonly number[];
  /** Median engagement per piece per week, aligned with `creators`. */
  engagement: readonly number[];
}

export interface StageResult {
  stage: Stage;
  /** This week's lift over the previous four. */
  lift: number;
  signal: boolean;
  /** One Spanish sentence that says why. */
  reason: string;
}

const times = (x: number) => x.toFixed(1).replace('.', ',');
const voices = (c: number) => `${c} ${c === 1 ? 'creador' : 'creadores'}`;

export function classifyStage(input: StageInput, ctx: StageContext): StageResult {
  const c = input.creators;
  const e = input.engagement;
  const t = c.length - 1;
  if (t < 0) {
    return { stage: 'stable', lift: 1, signal: false, reason: 'Todavía no hay piezas.' };
  }
  const current = c[t]!;
  const lift = liftAt(c, t);
  const signal = isSignal(lift, current);
  const previousSignal = t >= 1 && isSignal(liftAt(c, t - 1), c[t - 1]!);

  // 1. Declining: fewer voices and less attention, two weeks in a row.
  if (
    t >= 2 &&
    c[t]! < c[t - 1]! &&
    c[t - 1]! < c[t - 2]! &&
    (e[t] ?? 0) < (e[t - 1] ?? 0) &&
    (e[t - 1] ?? 0) < (e[t - 2] ?? 0)
  ) {
    return {
      stage: 'declining',
      lift,
      signal,
      reason: 'Menos creadores y menos interacción por pieza dos semanas seguidas.',
    };
  }

  // 2. Saturated: everyone is on it and it no longer surges, or it stopped growing while each
  //    piece earns less. A crowd that is still surging is a rising wave, not a saturated one.
  if (current >= MIN_CREATORS && current >= ctx.p90 && lift < SIGNAL_LIFT) {
    return {
      stage: 'saturated',
      lift,
      signal,
      reason: `Lo publicaron ${voices(current)} esta semana, más que el 90 % de los temas, y ya no sube: todos lo están contando.`,
    };
  }
  const peak = Math.max(0, ...e.slice(0, t + 1));
  const drop = peak > 0 ? 1 - (e[t] ?? 0) / peak : 0;
  if (current >= MIN_CREATORS && lift < FLAT_LIFT && drop >= ENGAGEMENT_DROP) {
    return {
      stage: 'saturated',
      lift,
      signal,
      reason: `Ya no crece y cada pieza recibe ${Math.round(drop * 100)} % menos interacción que en su mejor semana.`,
    };
  }

  // 3. Growing: moving, and either for the second week or already with a crowd.
  if (signal && (previousSignal || current >= ctx.p50)) {
    return {
      stage: 'growing',
      lift,
      signal,
      reason: `${voices(current)} esta semana, ${times(lift)} veces su nivel de las 4 anteriores${previousSignal ? ', y sube por segunda semana' : ''}.`,
    };
  }

  // 4. Emerging: moving, with few voices yet.
  if (signal) {
    return {
      stage: 'emerging',
      lift,
      signal,
      reason: `Todavía pocos creadores (${current}), pero ${times(lift)} veces su nivel de las 4 semanas anteriores.`,
    };
  }

  return {
    stage: 'stable',
    lift,
    signal,
    reason:
      lift >= SIGNAL_LIFT
        ? `Sube ${times(lift)} veces, pero con menos de ${MIN_CREATORS} creadores todavía es una anécdota.`
        : 'Sin cambios fuertes frente a las 4 semanas anteriores.',
  };
}

export type Timing = 'enter-now' | 'this-week' | 'own-angle' | 'skip' | 'watch';

export const TIMING_LABEL: Record<Timing, string> = {
  'enter-now': 'Entra ya',
  'this-week': 'Esta semana',
  'own-angle': 'Solo con ángulo propio',
  skip: 'No entres',
  watch: 'Observa',
};

/** Fit at or above which an emerging topic is worth being first on. */
export const ENTER_NOW_FIT = 7;

/** When to publish, from the stage and the fit with 30X's audience (1–10; null when unknown). */
export function timingFor(stage: Stage, fit: number | null | undefined): Timing {
  switch (stage) {
    case 'emerging':
      return typeof fit === 'number' && fit >= ENTER_NOW_FIT ? 'enter-now' : 'watch';
    case 'growing':
      return 'this-week';
    case 'saturated':
      return 'own-angle';
    case 'declining':
      return 'skip';
    case 'stable':
      return 'watch';
  }
}

/**
 * «Se está formando»: moving in the technical lane (GitHub, Hacker News, Hugging Face, X,
 * Bluesky) while LinkedIn and Instagram are still at or below their 10th percentile. The window
 * to arrive first.
 */
export function formingLane(
  technicalLift: number,
  mainstreamCreators: number,
  p10: number,
  technicalCreators: number = MIN_CREATORS,
): boolean {
  return (
    technicalLift >= SIGNAL_LIFT && technicalCreators >= MIN_CREATORS && mainstreamCreators <= p10
  );
}
