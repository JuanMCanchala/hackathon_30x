/**
 * One comparable number per piece, whatever the platform calls its reactions. Weights follow how
 * much effort each action takes: a comment or a save says more than a like, a share puts the
 * sharer's name on it. Views count only where likes are hidden, scaled to what a like is usually
 * worth (likes run at a few per hundred views on YouTube and Reels).
 */
import type { Metrics, Platform } from './types';

export const WEIGHTS = { likes: 1, comments: 2, shares: 3, saves: 2 } as const;
/** A view is worth a fiftieth of a like when the platform shows no likes. */
export const VIEW_WEIGHT = 0.02;

/** Platforms whose readers expose no engagement: news, newsletters and paper listings. */
const UNMEASURED: readonly Platform[] = ['news', 'newsletter', 'arxiv'];

const n = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function engagementOf(metrics: Metrics, platform: Platform): number {
  if (UNMEASURED.includes(platform)) return 0;
  const interactions =
    n(metrics.likes) * WEIGHTS.likes +
    n(metrics.comments) * WEIGHTS.comments +
    n(metrics.shares) * WEIGHTS.shares +
    n(metrics.saves) * WEIGHTS.saves;
  const likesKnown = typeof metrics.likes === 'number' && metrics.likes > 0;
  return interactions + (likesKnown ? 0 : n(metrics.views) * VIEW_WEIGHT);
}

export type AuthorTier = 'micro' | 'mid' | 'macro' | 'mega' | 'unknown';

/** Audience size buckets: under 10 k, under 100 k, under 1 M, and above. */
export function authorTier(followers: number | undefined): AuthorTier {
  if (typeof followers !== 'number' || !Number.isFinite(followers) || followers < 0) {
    return 'unknown';
  }
  if (followers < 10_000) return 'micro';
  if (followers < 100_000) return 'mid';
  if (followers < 1_000_000) return 'macro';
  return 'mega';
}

export const AUTHOR_TIER_LABEL: Record<AuthorTier, string> = {
  micro: 'menos de 10 mil seguidores',
  mid: 'entre 10 mil y 100 mil seguidores',
  macro: 'entre 100 mil y un millón de seguidores',
  mega: 'más de un millón de seguidores',
  unknown: 'seguidores sin dato',
};
