import { describe, expect, it } from 'vitest';
import { blueskyWeekly, hnWeekly, mondayOf, weeksBetween, wikipediaDaily } from '../src/series';
import { fakeFetcher, fixture } from './helpers';

describe('weeks', () => {
  it('starts every week on Monday, UTC', () => {
    expect(mondayOf('2026-10-17')).toBe('2026-10-12'); // Saturday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12'); // Monday
    expect(mondayOf('2026-10-18T23:59:59Z')).toBe('2026-10-12'); // Sunday night
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });

  it('lists the Mondays of every week a range touches', () => {
    expect(weeksBetween('2026-09-30', '2026-10-17')).toEqual([
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
  });
});

describe('wikipediaDaily', () => {
  it('asks for people-only daily views and returns dated points', async () => {
    const body = JSON.stringify({
      items: [
        { timestamp: '2025032500', views: 12_000 },
        { timestamp: '2025032600', views: 30_248 },
      ],
    });
    const fetcher = fakeFetcher([[/wikimedia\.org/, 200, body]]);
    const points = await wikipediaDaily('en', 'Vibe coding', '2025-03-25', '2025-03-26', {
      fetcher,
    });
    expect(fetcher.calls[0]!.url).toBe(
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Vibe_coding/daily/20250325/20250326',
    );
    expect(points).toEqual([
      { date: '2025-03-25', value: 12_000 },
      { date: '2025-03-26', value: 30_248 },
    ]);
  });

  it('is empty when the article has no data', async () => {
    const fetcher = fakeFetcher([[/wikimedia/, 404, '{"title":"Not found."}']]);
    expect(
      await wikipediaDaily('es', 'No_existe', '2025-01-01', '2025-01-31', { fetcher }),
    ).toEqual([]);
  });
});

describe('hnWeekly', () => {
  it('counts stories per week with a time window on each request', async () => {
    const fetcher = fakeFetcher([[/hn\.algolia\.com/, 200, '{"nbHits":87,"hits":[]}']]);
    const points = await hnWeekly('"vibe coding"', '2025-10-06', '2025-10-19', {
      fetcher,
      pauseMs: 0,
    });
    expect(points).toEqual([
      { date: '2025-10-06', value: 87 },
      { date: '2025-10-13', value: 87 },
    ]);
    const first = decodeURIComponent(fetcher.calls[0]!.url);
    expect(first).toContain('created_at_i>=1759708800,created_at_i<1760313600');
    expect(first).toContain('hitsPerPage=0');
  });
});

describe('blueskyWeekly', () => {
  it('uses the total hits of each weekly window, on api.bsky.app', async () => {
    const fetcher = fakeFetcher([
      [/api\.bsky\.app\/xrpc\/app\.bsky\.feed\.searchPosts/, 200, fixture('bluesky-search.json')],
    ]);
    const points = await blueskyWeekly('agentes de IA', 'es', '2026-10-05', '2026-10-12', {
      fetcher,
      pauseMs: 0,
    });
    expect(points).toEqual([
      { date: '2026-10-05', value: 111 },
      { date: '2026-10-12', value: 111 },
    ]);
    const url = new URL(fetcher.calls[0]!.url);
    expect(url.host).toBe('api.bsky.app');
    expect(url.searchParams.get('lang')).toBe('es');
    expect(url.searchParams.get('since')).toBe('2026-10-05T00:00:00.000Z');
    expect(url.searchParams.get('until')).toBe('2026-10-12T00:00:00.000Z');
  });
});
