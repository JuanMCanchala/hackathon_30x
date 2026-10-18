/**
 * Growth of a topic, week by week. The unit is the distinct creator, not the piece: one account
 * posting ten times is one voice, ten accounts posting once is a conversation. Snap's trend
 * detector counts unique posters for the same reason, and its cutoff of 1.8 times the recent level
 * gave about 92 % precision (LLM-Enhanced Topical Trend Detection, 2026).
 */
import { median, mean, poissonTail } from './stats';
import type { Platform } from './types';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Weeks of history the current week is compared against. */
export const BASELINE_WEEKS = 4;
/** Current creators ÷ their recent level at or above which a topic is moving. */
export const SIGNAL_LIFT = 1.8;
/**
 * A week is a burst when P(X ≥ this week | Poisson baseline) falls below this: about 1 in 10 000
 * by chance, so roughly 100 weeks × 3 sources leave a stable topic a 3 % chance of one false
 * burst. Reported next to the lift, not part of the signal: it only bites on small counts (on page
 * views any lift of 1.8 has p ≈ 0), and in the backtest it cost lead time for one false alarm.
 */
export const BURST_P = 1e-4;
/** Fewer voices than this is an anecdote, not a trend. */
export const MIN_CREATORS = 3;
/** Creators at which the confidence in a lift reaches 63 % (1 − e⁻¹). */
export const CONFIDENCE_CREATORS = 5;
/** Each platform beyond the first raises momentum by this share… */
export const PLATFORM_BONUS = 0.15;
/** …up to this much: being everywhere confirms a wave, it does not make one. */
export const MAX_PLATFORM_BONUS = 0.45;

// ---------------------------------------------------------------------------------------------
// Weeks. A week starts on Monday, in UTC, and is named by that Monday (YYYY-MM-DD).

/** The Monday (UTC) that starts the week containing `date`. */
export function weekOf(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const t = d.getTime();
  if (Number.isNaN(t)) throw new RangeError(`Fecha inválida: ${String(date)}`);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

export function addWeeks(week: string, n: number): string {
  return new Date(Date.parse(`${week}T00:00:00Z`) + n * WEEK_MS).toISOString().slice(0, 10);
}

/** Every week from the one containing `from` to the one containing `to`, both included. */
export function weekRange(from: string, to: string): string[] {
  const weeks: string[] = [];
  const last = weekOf(to);
  for (let w = weekOf(from); w <= last; w = addWeeks(w, 1)) weeks.push(w);
  return weeks;
}

/** The `count` weeks that end with `current`, oldest first. */
export function weeksEndingAt(current: string, count: number): string[] {
  const end = weekOf(current);
  return Array.from({ length: count }, (_, i) => addWeeks(end, i - count + 1));
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

// ---------------------------------------------------------------------------------------------
// Weekly series.

export interface TopicPiece {
  topicId: string;
  platform: Platform;
  /** Unique within the platform; creators are counted as platform + author. */
  authorId: string;
  publishedAt: string;
  engagement: number;
}

export interface WeekStats {
  week: string;
  /** Distinct creators who published on the topic that week. */
  creators: number;
  pieces: number;
  /** Median engagement per piece; 0 when there were none. */
  medianEngagement: number;
  /** The platforms it appeared on that week, sorted. */
  platforms: Platform[];
}

/** One topic's weeks, zero-filled over `weeks` (oldest first). Pieces outside them are ignored. */
export function weeklySeries(
  pieces: readonly Omit<TopicPiece, 'topicId'>[],
  weeks: readonly string[],
): WeekStats[] {
  const byWeek = new Map<
    string,
    { creators: Set<string>; engagement: number[]; platforms: Set<Platform> }
  >();
  for (const w of weeks)
    byWeek.set(w, { creators: new Set(), engagement: [], platforms: new Set() });
  for (const p of pieces) {
    const bucket = byWeek.get(weekOf(p.publishedAt));
    if (!bucket) continue;
    bucket.creators.add(`${p.platform}:${p.authorId}`);
    bucket.engagement.push(p.engagement);
    bucket.platforms.add(p.platform);
  }
  return weeks.map((week) => {
    const b = byWeek.get(week)!;
    return {
      week,
      creators: b.creators.size,
      pieces: b.engagement.length,
      medianEngagement: median(b.engagement),
      platforms: [...b.platforms].sort(),
    };
  });
}

/** `weeklySeries` for every topic present in `pieces`. */
export function seriesByTopic(
  pieces: readonly TopicPiece[],
  weeks: readonly string[],
): Map<string, WeekStats[]> {
  const groups = new Map<string, TopicPiece[]>();
  for (const p of pieces) {
    const list = groups.get(p.topicId);
    if (list) list.push(p);
    else groups.set(p.topicId, [p]);
  }
  const out = new Map<string, WeekStats[]>();
  for (const [topicId, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    out.set(topicId, weeklySeries(list, weeks));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Rolling windows. The live radar measures the last 7 days up to now, not the calendar week: on
// a Monday the calendar week holds one day and every topic would look like it is falling.

export interface RollingWindow {
  /** Exclusive start, ISO instant. */
  start: string;
  /** Inclusive end, ISO instant. */
  end: string;
  /** The end's date, YYYY-MM-DD (UTC), used as the window's name in series. */
  label: string;
}

/**
 * `count` back-to-back 7-day windows ending at `asOf`, oldest first. Window k covers
 * (asOf − 7·(count − k) days, asOf − 7·(count − k − 1) days].
 */
export function rollingWindows(asOf: string, count: number): RollingWindow[] {
  const end = Date.parse(asOf);
  if (Number.isNaN(end)) throw new RangeError(`Fecha inválida: ${asOf}`);
  return Array.from({ length: count }, (_, k) => {
    const to = new Date(end - (count - k - 1) * WEEK_MS);
    const from = new Date(end - (count - k) * WEEK_MS);
    return {
      start: from.toISOString(),
      end: to.toISOString(),
      label: to.toISOString().slice(0, 10),
    };
  });
}

type Bounds = readonly (readonly [number, number])[];

const boundsOf = (windows: readonly RollingWindow[]): Bounds =>
  windows.map((w) => [Date.parse(w.start), Date.parse(w.end)] as const);

function indexIn(t: number, bounds: Bounds): number {
  for (let k = bounds.length - 1; k >= 0; k -= 1) {
    const [from, to] = bounds[k]!;
    if (t > from && t <= to) return k;
  }
  return -1;
}

/** The index of the window that holds `iso`, or -1 when it falls outside all of them. */
export function windowIndexOf(iso: string, windows: readonly RollingWindow[]): number {
  return indexIn(Date.parse(iso), boundsOf(windows));
}

/** `weeklySeries` over rolling windows: the same shape, with `week` set to each window's label. */
export function windowSeries(
  pieces: readonly Omit<TopicPiece, 'topicId'>[],
  windows: readonly RollingWindow[],
): WeekStats[] {
  const buckets = windows.map(() => ({
    creators: new Set<string>(),
    engagement: [] as number[],
    platforms: new Set<Platform>(),
  }));
  const bounds = boundsOf(windows);
  for (const p of pieces) {
    const k = indexIn(Date.parse(p.publishedAt), bounds);
    if (k < 0) continue;
    const b = buckets[k]!;
    b.creators.add(`${p.platform}:${p.authorId}`);
    b.engagement.push(p.engagement);
    b.platforms.add(p.platform);
  }
  return windows.map((w, k) => ({
    week: w.label,
    creators: buckets[k]!.creators.size,
    pieces: buckets[k]!.engagement.length,
    medianEngagement: median(buckets[k]!.engagement),
    platforms: [...buckets[k]!.platforms].sort(),
  }));
}

/** `windowSeries` for every topic present in `pieces`. */
export function seriesByTopicWindows(
  pieces: readonly TopicPiece[],
  windows: readonly RollingWindow[],
): Map<string, WeekStats[]> {
  const groups = new Map<string, TopicPiece[]>();
  for (const p of pieces) {
    const list = groups.get(p.topicId);
    if (list) list.push(p);
    else groups.set(p.topicId, [p]);
  }
  const out = new Map<string, WeekStats[]>();
  for (const [topicId, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    out.set(topicId, windowSeries(list, windows));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Lift and momentum.

/**
 * How far a week stands above its recent level: (value + 1) ÷ (mean of up to `baselineWeeks`
 * previous values + 1). The +1 keeps a topic that goes from 0 to 1 voice from looking infinite.
 */
export function liftAt(
  values: readonly number[],
  index = values.length - 1,
  baselineWeeks = BASELINE_WEEKS,
): number {
  if (index < 0 || index >= values.length) return 1;
  const previous = values.slice(Math.max(0, index - baselineWeeks), index);
  return (values[index]! + 1) / (mean(previous) + 1);
}

/**
 * How surprising a week is as noise: P(X ≥ value) with X ~ Poisson(mean of the same baseline
 * the lift uses). Small means a burst, the reading of Kleinberg's burst detection (2002, «Bursty
 * and hierarchical structure in streams»). The lift says how much a topic grew; this says how
 * unlikely that growth is by chance, which a lift of 3 on 3 voices and on 300 do not share.
 */
export function burstAt(
  values: readonly number[],
  index = values.length - 1,
  baselineWeeks = BASELINE_WEEKS,
): number {
  if (index < 0 || index >= values.length) return 1;
  const previous = values.slice(Math.max(0, index - baselineWeeks), index);
  return poissonTail(values[index]!, mean(previous));
}

/** A topic is moving when it stands 1.8 times above its recent level with at least 3 voices. */
export function isSignal(lift: number, creators: number): boolean {
  return lift >= SIGNAL_LIFT && creators >= MIN_CREATORS;
}

/** How much to trust a lift given how many voices it rests on: 0 with none, close to 1 with 15. */
export function confidence(creators: number): number {
  return creators > 0 ? 1 - Math.exp(-creators / CONFIDENCE_CREATORS) : 0;
}

export function platformBonus(platforms: number): number {
  return Math.min(MAX_PLATFORM_BONUS, PLATFORM_BONUS * Math.max(0, platforms - 1));
}

/**
 * The ranking score for «los que más crecen»: ln(lift) × confidence × (1 + platform bonus).
 * A topic that is not growing scores 0, and the bonus multiplies instead of adding, so being on
 * many platforms never lifts a topic that is flat or falling above one that is rising.
 */
export function momentum(lift: number, creators: number, platforms = 1): number {
  if (!(lift > 1) || !(creators > 0)) return 0;
  return Math.log(lift) * confidence(creators) * (1 + platformBonus(platforms));
}
