/**
 * The weekly radar: growth, stage and momentum put together into «los temas que más crecen».
 * It measures rolling 7-day windows that end at `asOf` (now, in the live radar), so the current
 * week is always seven full days, whatever the weekday of the demo.
 *
 * Pure: the API hands in each topic's pieces (filtered by platform or region if the person asked
 * for it) and the fit the language model gave it; the radar counts, classifies and ranks.
 */
import {
  BASELINE_WEEKS,
  burstAt,
  isSignal,
  liftAt,
  momentum,
  rollingWindows,
  windowSeries,
  type TopicPiece,
  type WeekStats,
  type RollingWindow,
} from './growth';
import {
  classifyStage,
  formingLane,
  STAGE_LABEL,
  stageContext,
  timingFor,
  TIMING_LABEL,
  type Stage,
  type StageContext,
  type Timing,
} from './lifecycle';
import { percentile, round } from './stats';
import { TECHNICAL, type Platform } from './types';

/** Weeks shown in each sparkline. */
export const SPARKLINE_WEEKS = 8;
/** Windows of data the radar reads: the sparkline plus the baseline behind its first week. */
export const RADAR_WINDOWS = SPARKLINE_WEEKS + BASELINE_WEEKS;
/** The platforms where 30X publishes and the «Se está formando» lane checks it has not arrived. */
export const ARRIVAL_PLATFORMS: readonly Platform[] = ['linkedin', 'instagram'];

export type RadarPiece = Omit<TopicPiece, 'topicId'>;

export interface RadarTopicInput {
  id: string;
  label: string;
  /** The topic's pieces, any date; only those inside the windows count. */
  pieces: readonly RadarPiece[];
  /** Fit with 30X's audience, 1–10; null when not judged yet. */
  fit?: number | null;
}

export interface RadarTopic {
  id: string;
  label: string;
  stage: Stage;
  stageLabel: string;
  stageReason: string;
  lift: number;
  /** (lift − 1) as a percentage, rounded: «+140 %». */
  growthPct: number;
  /**
   * P(this week's creators | Poisson around the lift's baseline): how likely the growth is by
   * chance. Shown next to the lift; it does not decide `signal` (see BURST_P).
   */
  burstP: number;
  momentum: number;
  signal: boolean;
  creators: number;
  pieces: number;
  medianEngagement: number;
  platforms: Platform[];
  /** Distinct creators in each of the last weeks, oldest first. */
  sparkline: number[];
  /** Every window's stats, oldest first; `week` is the window's end date. */
  series: WeekStats[];
  fit: number | null;
  timing: Timing;
  timingLabel: string;
  /** «Se está formando»: moving in the technical lane, not yet on LinkedIn and Instagram. */
  forming: boolean;
  /** The technical lane's lift this week (1 when it has no history). */
  technicalLift: number;
  /** This week's distinct creators on LinkedIn and Instagram. */
  arrivalCreators: number;
}

export interface RankOptions {
  /** The end of the current window, ISO instant: usually now. */
  asOf: string;
  /** How many topics make the top. Default 10. */
  top?: number;
  /** Windows to read; at least the sparkline plus the baseline. Default RADAR_WINDOWS. */
  windows?: number;
}

export interface RadarResult {
  asOf: string;
  windows: RollingWindow[];
  /** The topics growing the most, highest momentum first. Only topics with momentum. */
  top: RadarTopic[];
  /** Topics forming in the technical lane, strongest technical lift first. */
  forming: RadarTopic[];
  /** Every topic scored, highest momentum first. */
  all: RadarTopic[];
  context: StageContext;
}

function order(a: RadarTopic, b: RadarTopic): number {
  return (
    b.momentum - a.momentum ||
    b.lift - a.lift ||
    b.creators - a.creators ||
    a.id.localeCompare(b.id)
  );
}

export function rankTopics(topics: readonly RadarTopicInput[], options: RankOptions): RadarResult {
  const windows = rollingWindows(
    options.asOf,
    Math.max(options.windows ?? RADAR_WINDOWS, BASELINE_WEEKS + 3),
  );
  const prepared = topics.map((t) => {
    const series = windowSeries(t.pieces, windows);
    const technical = windowSeries(
      t.pieces.filter((p) => TECHNICAL.includes(p.platform)),
      windows,
    ).map((w) => w.creators);
    const arrival = windowSeries(
      t.pieces.filter((p) => ARRIVAL_PLATFORMS.includes(p.platform)),
      windows.slice(-1),
    )[0]!.creators;
    return { t, series, technical, arrival };
  });

  const context = stageContext(prepared.map((p) => p.series.at(-1)!.creators));
  const arrivalP10 = percentile(
    prepared.map((p) => p.arrival).filter((c) => c > 0),
    10,
  );

  const scored = prepared.map(({ t, series, technical, arrival }): RadarTopic => {
    const creators = series.map((w) => w.creators);
    const engagement = series.map((w) => w.medianEngagement);
    const current = series.at(-1)!;
    const stage = classifyStage({ creators, engagement }, context);
    const fit = typeof t.fit === 'number' ? t.fit : null;
    const technicalLift = liftAt(technical);
    const timing = timingFor(stage.stage, fit);
    return {
      id: t.id,
      label: t.label,
      stage: stage.stage,
      stageLabel: STAGE_LABEL[stage.stage],
      stageReason: stage.reason,
      lift: round(stage.lift, 3),
      growthPct: Math.round((stage.lift - 1) * 100),
      burstP: burstAt(creators),
      momentum: round(momentum(stage.lift, current.creators, current.platforms.length), 6),
      signal: isSignal(stage.lift, current.creators),
      creators: current.creators,
      pieces: current.pieces,
      medianEngagement: current.medianEngagement,
      platforms: current.platforms,
      sparkline: creators.slice(-SPARKLINE_WEEKS),
      series,
      fit,
      timing,
      timingLabel: TIMING_LABEL[timing],
      forming: formingLane(technicalLift, arrival, arrivalP10, technical.at(-1) ?? 0),
      technicalLift: round(technicalLift, 3),
      arrivalCreators: arrival,
    };
  });

  const all = [...scored].sort(order);
  return {
    asOf: options.asOf,
    windows,
    top: all.filter((t) => t.momentum > 0).slice(0, options.top ?? 10),
    forming: scored
      .filter((t) => t.forming)
      .sort((a, b) => b.technicalLift - a.technicalLift || a.id.localeCompare(b.id)),
    all,
    context,
  };
}
