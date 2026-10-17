/**
 * History for the backfill and the backtest: daily Wikipedia pageviews, and weekly counts of
 * Hacker News stories and Bluesky posts for a query. Weeks start on Monday (UTC).
 * These functions read the network, politely: one request at a time with a pause in between.
 */
import type { Point, RawItem } from '@radar/core';
import { BROWSER_UA, type Fetcher, httpFetch, sleep } from './http';
import { blueskyItem, type BlueskyPost } from './parsers/bluesky';
import { parseHn } from './parsers/technical';

export interface SeriesOptions {
  fetcher?: Fetcher;
  /** Pause between requests, in milliseconds. */
  pauseMs?: number;
}

const DAY = 86_400_000;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The Monday (UTC) that starts the week of a date, as YYYY-MM-DD. */
export function mondayOf(date: string | number | Date): string {
  const d = new Date(typeof date === 'string' && date.length === 10 ? `${date}T00:00:00Z` : date);
  const weekday = (d.getUTCDay() + 6) % 7;
  return day(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - weekday * DAY);
}

/** The Mondays of every week that touches [from, to], oldest first. */
export function weeksBetween(fromISO: string, toISO: string): string[] {
  const weeks: string[] = [];
  const last = Date.parse(`${mondayOf(toISO)}T00:00:00Z`);
  for (let t = Date.parse(`${mondayOf(fromISO)}T00:00:00Z`); t <= last; t += 7 * DAY) {
    weeks.push(day(t));
  }
  return weeks;
}

async function getJson<T>(fetcher: Fetcher, url: string): Promise<{ status: number; data?: T }> {
  const res = await fetcher(url, {
    headers: { 'user-agent': BROWSER_UA, accept: 'application/json' },
  });
  if (res.status < 200 || res.status >= 300) return { status: res.status };
  try {
    return { status: res.status, data: JSON.parse(res.body) as T };
  } catch {
    return { status: res.status };
  }
}

/**
 * Daily views of a Wikipedia article (people only, every device). The article is its title as
 * in the URL, e.g. "Vibe_coding"; spaces become underscores. Missing days are not filled in.
 */
export async function wikipediaDaily(
  lang: string,
  article: string,
  from: string,
  to: string,
  options: SeriesOptions = {},
): Promise<Point[]> {
  const fetcher = options.fetcher ?? httpFetch;
  const compactDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
  const title = encodeURIComponent(article.trim().replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${title}/daily/${compactDate(from)}/${compactDate(to)}`;
  const { data } = await getJson<{ items?: { timestamp?: string; views?: number }[] }>(
    fetcher,
    url,
  );
  return (data?.items ?? [])
    .filter((i) => i.timestamp && typeof i.views === 'number')
    .map((i) => ({
      date: `${i.timestamp!.slice(0, 4)}-${i.timestamp!.slice(4, 6)}-${i.timestamp!.slice(6, 8)}`,
      value: i.views!,
    }));
}

/** Weekly count of Hacker News stories that match a query (Algolia's nbHits per window). */
export async function hnWeekly(
  query: string,
  fromISO: string,
  toISO: string,
  options: SeriesOptions = {},
): Promise<Point[]> {
  const fetcher = options.fetcher ?? httpFetch;
  const points: Point[] = [];
  for (const week of weeksBetween(fromISO, toISO)) {
    const start = Date.parse(`${week}T00:00:00Z`) / 1000;
    const end = start + 7 * 86_400;
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>=${start},created_at_i<${end}`)}&hitsPerPage=0`;
    const { data } = await getJson<{ nbHits?: number }>(fetcher, url);
    points.push({ date: week, value: data?.nbHits ?? 0 });
    await sleep(options.pauseMs ?? 150);
  }
  return points;
}

/** Hacker News stories that match a query in a window, as pieces (up to 1,000). */
export async function hnStories(
  query: string,
  fromISO: string,
  toISO: string,
  options: SeriesOptions = {},
): Promise<RawItem[]> {
  const fetcher = options.fetcher ?? httpFetch;
  const start = Math.floor(Date.parse(fromISO) / 1000);
  const end = Math.floor(Date.parse(toISO) / 1000);
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>=${start},created_at_i<${end}`)}&hitsPerPage=1000`;
  const res = await fetcher(url, { headers: { 'user-agent': BROWSER_UA } });
  if (res.status !== 200) return [];
  const capturedAt = new Date().toISOString();
  return parseHn(res.body, {
    source: 'hn',
    key: 'series',
    url,
    status: res.status,
    bytes: res.body.length,
    file: null,
    capturedAt,
    meta: { query },
  });
}

export interface BlueskySearchOptions extends SeriesOptions {
  lang?: string;
  since?: string;
  until?: string;
  sort?: 'top' | 'latest';
  limit?: number;
  cursor?: string;
}

/** One page of Bluesky's post search, as pieces, with the total number of hits. */
export async function blueskySearch(
  query: string,
  options: BlueskySearchOptions = {},
): Promise<{ items: RawItem[]; hitsTotal: number; cursor?: string }> {
  const fetcher = options.fetcher ?? httpFetch;
  const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 100) });
  if (options.sort) params.set('sort', options.sort);
  if (options.lang) params.set('lang', options.lang);
  if (options.since) params.set('since', new Date(options.since).toISOString());
  if (options.until) params.set('until', new Date(options.until).toISOString());
  if (options.cursor) params.set('cursor', options.cursor);
  // api.bsky.app answers anonymous searches; public.api.bsky.app answers 403.
  const url = `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`;
  const { data } = await getJson<{ posts?: BlueskyPost[]; hitsTotal?: number; cursor?: string }>(
    fetcher,
    url,
  );
  const capturedAt = new Date().toISOString();
  const items = (data?.posts ?? [])
    .map((p) => blueskyItem(p, capturedAt, query))
    .filter((i): i is RawItem => i !== undefined);
  return { items, hitsTotal: data?.hitsTotal ?? items.length, cursor: data?.cursor };
}

/** Weekly number of Bluesky posts that match a query (the search's `hitsTotal` per week). */
export async function blueskyWeekly(
  query: string,
  lang: string | undefined,
  fromISO: string,
  toISO: string,
  options: SeriesOptions = {},
): Promise<Point[]> {
  const points: Point[] = [];
  for (const week of weeksBetween(fromISO, toISO)) {
    const since = `${week}T00:00:00Z`;
    const until = new Date(Date.parse(since) + 7 * DAY).toISOString();
    const { hitsTotal } = await blueskySearch(query, {
      ...options,
      lang,
      since,
      until,
      limit: 1,
    });
    points.push({ date: week, value: hitsTotal });
    await sleep(options.pauseMs ?? 300);
  }
  return points;
}
