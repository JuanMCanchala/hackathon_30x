import { describe, expect, it } from 'vitest';
import { authorTier, engagementOf, VIEW_WEIGHT } from '../src';

describe('engagementOf', () => {
  it('weighs comments, shares and saves above likes', () => {
    expect(engagementOf({ likes: 100, comments: 10, shares: 5, saves: 2 }, 'linkedin')).toBe(
      100 + 20 + 15 + 4,
    );
  });

  it('counts views only when the platform hides likes', () => {
    expect(engagementOf({ views: 10_000 }, 'youtube')).toBe(10_000 * VIEW_WEIGHT);
    expect(engagementOf({ views: 10_000, likes: 50 }, 'youtube')).toBe(50);
  });

  it('gives no engagement to sources that do not measure it', () => {
    expect(engagementOf({ likes: 999 }, 'news')).toBe(0);
    expect(engagementOf({ likes: 999 }, 'arxiv')).toBe(0);
  });

  it('ignores negative and missing numbers', () => {
    expect(engagementOf({ likes: -5, comments: Number.NaN }, 'x')).toBe(0);
  });
});

describe('authorTier', () => {
  it('buckets audiences at 10 k, 100 k and 1 M', () => {
    expect(authorTier(undefined)).toBe('unknown');
    expect(authorTier(9_999)).toBe('micro');
    expect(authorTier(10_000)).toBe('mid');
    expect(authorTier(150_000)).toBe('macro');
    expect(authorTier(1_020_926)).toBe('mega');
  });
});
