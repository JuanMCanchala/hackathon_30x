import { describe, expect, it } from 'vitest';
import type { RawItem } from '@radar/core';
import { fetchYoutubeVideos, parseYoutubeVideos, withYoutubeVideos } from '../src/youtube-api';
import { fakeFetcher, fixture } from './helpers';

/** A videos.list answer written by hand, for the cases the recorded one does not show. */
const answer = (...items: object[]) => JSON.stringify({ kind: 'youtube#videoListResponse', items });
const video = (id: string, statistics: Record<string, string> = { viewCount: '10' }) => ({
  id,
  snippet: {
    publishedAt: '2026-10-15T12:00:00Z',
    channelId: `UC-${id}`,
    title: `Video ${id}`,
    channelTitle: `Canal ${id}`,
  },
  statistics,
  contentDetails: { duration: 'PT1M5S' },
});

describe('parseYoutubeVideos', () => {
  it('reads exact dates and counts from a recorded answer', () => {
    const videos = parseYoutubeVideos(fixture('youtube-videos.json'));
    expect(videos).toHaveLength(5);
    expect(videos.find((v) => v.id === '-6KC3hR36d4')).toEqual({
      id: '-6KC3hR36d4',
      publishedAt: '2026-10-13T02:18:56.000Z',
      views: 167137,
      likes: 9191,
      comments: 762,
      durationSec: 6823,
      title: 'Clase 01 - Asistentes de IA desde cero con Claude Cowork y Gemini Gems',
      channelId: 'UCkIREct1yO-CMDNB8D_VHMQ',
      channelTitle: 'Daxus Latam',
    });
    expect(videos.find((v) => v.id === '6H0zKbTKJZI')?.durationSec).toBe(40);
  });

  it('leaves out the counts a channel hides', () => {
    const [v] = parseYoutubeVideos(answer(video('a', { viewCount: '7', commentCount: '2' })));
    expect(v).toMatchObject({ views: 7, comments: 2 });
    expect(v).not.toHaveProperty('likes');
  });

  it('gives nothing for an error or a broken body', () => {
    expect(parseYoutubeVideos('{"error":{"code":403}}')).toEqual([]);
    expect(parseYoutubeVideos('not json')).toEqual([]);
  });
});

describe('fetchYoutubeVideos', () => {
  it('asks for up to 50 ids per call, with the key, and skips the deleted ones', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `id${i}`);
    const fetcher = fakeFetcher([
      [/id=id0%2C/, 200, answer(video('id0'), video('id1'))],
      [/id=id50&/, 200, answer()],
    ]);
    const videos = await fetchYoutubeVideos([...ids, 'id0'], 'KEY', fetcher);
    expect(fetcher.calls).toHaveLength(2);
    const first = new URL(fetcher.calls[0]!.url);
    expect(first.origin + first.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
    expect(first.searchParams.get('part')).toBe('snippet,statistics,contentDetails');
    expect(first.searchParams.get('id')!.split(',')).toHaveLength(50);
    expect(first.searchParams.get('key')).toBe('KEY');
    expect([...videos.keys()]).toEqual(['id0', 'id1']);
  });

  it('makes no call without ids and survives a failed batch', async () => {
    const none = fakeFetcher([]);
    expect((await fetchYoutubeVideos([], 'KEY', none)).size).toBe(0);
    expect(none.calls).toHaveLength(0);
    const quota = fakeFetcher([[/./, 403, '{"error":{"code":403}}']]);
    expect((await fetchYoutubeVideos(['a'], 'KEY', quota)).size).toBe(0);
  });
});

describe('withYoutubeVideos', () => {
  const searched: RawItem = {
    platform: 'youtube',
    source: 'youtube-search',
    externalId: '6H0zKbTKJZI',
    url: 'https://www.youtube.com/shorts/6H0zKbTKJZI',
    author: { id: '', name: '' },
    publishedAt: '2026-10-17T16:58:10.000Z',
    publishedApprox: true,
    title: 'Carrera de Marketing y Negocios Digitales con IA',
    text: 'Carrera de Marketing y Negocios Digitales con IA',
    format: 'short',
    metrics: { views: 46 },
    capturedAt: '2026-10-17T16:58:10.000Z',
    query: 'IA',
  };

  const videos = new Map(parseYoutubeVideos(fixture('youtube-videos.json')).map((v) => [v.id, v]));

  it('gives a short its exact date, channel and counts', () => {
    const [item] = withYoutubeVideos([searched], videos);
    expect(item).toMatchObject({
      source: 'youtube-search',
      url: searched.url,
      format: 'short',
      query: 'IA',
      author: { id: 'UCWwxU_VkC5cALXiuimijSog', name: 'Escuela Da Vinci' },
      publishedAt: '2026-10-16T15:27:36.000Z',
      publishedApprox: false,
      durationSec: 40,
      metrics: { views: 52, likes: 0, comments: 0 },
    });
  });

  it('leaves alone what the answer does not cover', () => {
    const bluesky = { ...searched, platform: 'bluesky' as const };
    const deleted = { ...searched, externalId: 'gone' };
    expect(withYoutubeVideos([bluesky, deleted], videos)).toEqual([bluesky, deleted]);
  });
});
