/**
 * Pieces that took off: engagement measured against what the same author usually gets, the way
 * YouTube outlier finders (1of10, vidIQ, Subscribr) measure a video against its channel. A big
 * account's ordinary post is not a breakout; a small account's 8× post is.
 */
import { median } from './stats';
import type { Format, Platform } from './types';

/** Pieces of the author's history used as the baseline (the closest in time). */
export const OUTLIER_HISTORY = 10;
/** Fewer earlier pieces than this and the author has no baseline of their own. */
export const MIN_AUTHOR_HISTORY = 3;

export type OutlierBand = 'none' | '2x' | '5x' | '10x';

export interface PieceEngagement {
  id: string;
  platform: Platform;
  /** Unique within the platform. */
  authorId: string;
  format: Format;
  publishedAt: string;
  engagement: number;
}

export interface OutlierScore {
  id: string;
  /** Engagement ÷ baseline. */
  ratio: number;
  band: OutlierBand;
  baseline: number;
  /** What the piece was compared with: its author, its platform and format, or nothing. */
  baselineKind: 'author' | 'peers' | 'none';
}

export function bandOf(ratio: number): OutlierBand {
  if (ratio >= 10) return '10x';
  if (ratio >= 5) return '5x';
  if (ratio >= 2) return '2x';
  return 'none';
}

const time = (iso: string) => Date.parse(iso);

/**
 * Scores every piece. The baseline is the median of the author's other pieces closest in time
 * (up to 10, at least 3); without that history, the median of the other pieces of the same
 * platform and format (at least 3). A baseline of 0 counts as 1 so that a first like is not
 * an infinite breakout.
 */
export function outlierScores(pieces: readonly PieceEngagement[]): Map<string, OutlierScore> {
  const byAuthor = new Map<string, PieceEngagement[]>();
  const byPeers = new Map<string, PieceEngagement[]>();
  for (const p of pieces) {
    const a = `${p.platform}:${p.authorId}`;
    const g = `${p.platform}:${p.format}`;
    (byAuthor.get(a) ?? byAuthor.set(a, []).get(a)!).push(p);
    (byPeers.get(g) ?? byPeers.set(g, []).get(g)!).push(p);
  }

  // Large peer groups use one median for everyone: leaving one piece out barely moves it, and
  // recomputing it per piece would be quadratic.
  const peerMedian = new Map<string, number>();
  for (const [g, list] of byPeers) {
    if (list.length > 20) peerMedian.set(g, median(list.map((o) => o.engagement)));
  }

  const scores = new Map<string, OutlierScore>();
  for (const p of pieces) {
    const own = byAuthor
      .get(`${p.platform}:${p.authorId}`)!
      .filter((o) => o.id !== p.id)
      .sort(
        (x, y) =>
          Math.abs(time(x.publishedAt) - time(p.publishedAt)) -
            Math.abs(time(y.publishedAt) - time(p.publishedAt)) || x.id.localeCompare(y.id),
      )
      .slice(0, OUTLIER_HISTORY);

    let baseline = 0;
    let baselineKind: OutlierScore['baselineKind'] = 'none';
    if (own.length >= MIN_AUTHOR_HISTORY) {
      baseline = median(own.map((o) => o.engagement));
      baselineKind = 'author';
    } else {
      const g = `${p.platform}:${p.format}`;
      const shared = peerMedian.get(g);
      if (shared !== undefined) {
        baseline = shared;
        baselineKind = 'peers';
      } else {
        const peers = byPeers.get(g)!.filter((o) => o.id !== p.id);
        if (peers.length >= MIN_AUTHOR_HISTORY) {
          baseline = median(peers.map((o) => o.engagement));
          baselineKind = 'peers';
        }
      }
    }
    const ratio = baselineKind === 'none' ? 1 : p.engagement / Math.max(baseline, 1);
    scores.set(p.id, { id: p.id, ratio, band: bandOf(ratio), baseline, baselineKind });
  }
  return scores;
}

export interface MetricSnapshot {
  capturedAt: string;
  engagement: number;
}

/**
 * Engagement gained per hour between the two latest captures of a piece: how fast it is moving
 * now. Null with fewer than two captures. Never negative: a platform recounting down is noise.
 */
export function velocity(snapshots: readonly MetricSnapshot[]): number | null {
  if (snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => time(a.capturedAt) - time(b.capturedAt));
  const last = sorted[sorted.length - 1]!;
  const previous = sorted[sorted.length - 2]!;
  const hours = (time(last.capturedAt) - time(previous.capturedAt)) / 3_600_000;
  if (!(hours > 0)) return null;
  return Math.max(0, (last.engagement - previous.engagement) / hours);
}
