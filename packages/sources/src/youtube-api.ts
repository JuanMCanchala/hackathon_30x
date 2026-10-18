/**
 * Exact YouTube data through the official YouTube Data API v3 `videos.list`: one quota unit per
 * call of up to 50 ids. The search page rounds dates («hace 2 días») and gives shorts neither date
 * nor channel; this fills them in for ids already scraped. Never `search.list` (100 units a call).
 */
import type { RawItem } from '@radar/core';
import { httpFetch, type Fetcher } from './http';
import { compact } from './util';

/** The most ids `videos.list` takes in one call. */
export const YOUTUBE_VIDEOS_BATCH = 50;

export interface YoutubeVideo {
  id: string;
  /** ISO 8601, exact. */
  publishedAt: string;
  views?: number;
  /** Absent when the channel hides it. */
  likes?: number;
  comments?: number;
  durationSec?: number;
  title: string;
  channelId: string;
  channelTitle: string;
}

interface ApiVideo {
  id?: string;
  snippet?: { publishedAt?: string; channelId?: string; title?: string; channelTitle?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
}

const count = (s: string | undefined): number | undefined =>
  s !== undefined && /^\d+$/.test(s) ? Number(s) : undefined;

/** ISO 8601 durations as the API writes them: PT1H2M3S, P1DT2H, P0D (a live stream). */
function isoSeconds(s: string | undefined): number | undefined {
  const m = s?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return undefined;
  const [d, h, min, sec] = m.slice(1).map((x) => Number(x ?? 0));
  return ((d! * 24 + h!) * 60 + min!) * 60 + sec!;
}

/** One `videos.list` answer; errors and broken bodies give nothing. Pure. */
export function parseYoutubeVideos(body: string): YoutubeVideo[] {
  let data: { items?: ApiVideo[] };
  try {
    data = JSON.parse(body) as { items?: ApiVideo[] };
  } catch {
    return [];
  }
  const videos: YoutubeVideo[] = [];
  for (const v of data.items ?? []) {
    const published = Date.parse(v.snippet?.publishedAt ?? '');
    if (!v.id || !Number.isFinite(published)) continue;
    videos.push(
      compact<YoutubeVideo>({
        id: v.id,
        publishedAt: new Date(published).toISOString(),
        views: count(v.statistics?.viewCount),
        likes: count(v.statistics?.likeCount),
        comments: count(v.statistics?.commentCount),
        durationSec: isoSeconds(v.contentDetails?.duration),
        title: v.snippet?.title ?? '',
        channelId: v.snippet?.channelId ?? '',
        channelTitle: v.snippet?.channelTitle ?? '',
      }),
    );
  }
  return videos;
}

/** The `videos.list` URL for up to 50 ids. It carries the key: never log or store it. */
export function youtubeVideosUrl(ids: string[], key: string): string {
  const params = new URLSearchParams({
    part: 'snippet,statistics,contentDetails',
    id: ids.join(','),
    key,
  });
  return `https://www.googleapis.com/youtube/v3/videos?${params}`;
}

/**
 * Exact data for these ids, one call per 50. Deleted or private videos are simply absent, and a
 * batch that fails (quota, network) is skipped: callers keep what the search page said.
 */
export async function fetchYoutubeVideos(
  ids: string[],
  key: string,
  fetcher: Fetcher = httpFetch,
): Promise<Map<string, YoutubeVideo>> {
  const unique = [...new Set(ids)];
  const videos = new Map<string, YoutubeVideo>();
  for (let i = 0; i < unique.length; i += YOUTUBE_VIDEOS_BATCH) {
    const batch = unique.slice(i, i + YOUTUBE_VIDEOS_BATCH);
    const res = await fetcher(youtubeVideosUrl(batch, key)).catch(() => null);
    if (res?.status !== 200) continue;
    for (const v of parseYoutubeVideos(res.body)) videos.set(v.id, v);
  }
  return videos;
}

/**
 * YouTube pieces with their exact date, channel and counts. Everything else stays as scraped:
 * source, URL, format and query, so a short found by search is still a short found by search.
 */
export function withYoutubeVideos(raws: RawItem[], videos: Map<string, YoutubeVideo>): RawItem[] {
  return raws.map((r) => {
    const v = r.platform === 'youtube' ? videos.get(r.externalId) : undefined;
    if (!v) return r;
    return {
      ...r,
      author: {
        ...r.author,
        id: v.channelId || r.author.id,
        name: r.author.name || v.channelTitle,
      },
      publishedAt: v.publishedAt,
      publishedApprox: false,
      title: r.title || v.title,
      durationSec: v.durationSec ?? r.durationSec,
      metrics: {
        ...r.metrics,
        ...compact({ views: v.views, likes: v.likes, comments: v.comments }),
      },
    };
  });
}
