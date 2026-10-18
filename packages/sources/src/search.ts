/**
 * Live searches for a followed topic: the same public pages the capture reads, asked about one
 * topic in one language and read by the same parsers. No login, no key.
 */
import type { RawItem } from '@radar/core';
import { BROWSER_UA, type Fetcher } from './http';
import { parsers } from './parse';
import type { CaptureRecord } from './types';

export type SearchLang = 'en' | 'pt' | 'es';
export type SearchSource = 'youtube' | 'bluesky' | 'hn';

const ACCEPT: Record<SearchLang, string> = {
  en: 'en-US,en;q=0.9',
  pt: 'pt-BR,pt;q=0.9',
  es: 'es-419,es;q=0.9',
};
/**
 * Where YouTube searches each language. Results change by country, and English also runs from
 * India, where much of the AI and business content in English comes from.
 */
const YOUTUBE_REGIONS: Record<SearchLang, { region: string; params: string }[]> = {
  en: [
    { region: 'US', params: 'hl=en&gl=US' },
    { region: 'IN', params: 'hl=en-IN&gl=IN' },
  ],
  pt: [{ region: 'BR', params: 'hl=pt-BR&gl=BR' }],
  es: [{ region: 'CO', params: 'hl=es-419&gl=CO' }],
};
/** YouTube's upload-date filters: today and this week. */
const YOUTUBE_TODAY = 'EgIIAg%253D%253D';
const YOUTUBE_WEEK = 'EgIIAw%253D%253D';

export interface SearchRequest {
  source: SearchSource;
  lang: SearchLang;
  /** The country a search runs from, when the source lets us choose (YouTube). */
  region?: string;
  query: string;
  url: string;
  headers: Record<string, string>;
}

/** What to ask each source for one query in one language, limited to the last `windowHours`. */
export function searchRequests(
  query: string,
  lang: SearchLang,
  now: Date,
  windowHours: number,
): SearchRequest[] {
  const since = new Date(now.getTime() - windowHours * 3_600_000);
  const q = encodeURIComponent(query);
  const browser = { 'user-agent': BROWSER_UA, 'accept-language': ACCEPT[lang] };
  const requests: SearchRequest[] = [
    ...YOUTUBE_REGIONS[lang].map(({ region, params }) => ({
      source: 'youtube' as const,
      lang,
      region,
      query,
      url: `https://www.youtube.com/results?search_query=${q}&sp=${windowHours <= 24 ? YOUTUBE_TODAY : YOUTUBE_WEEK}&${params}`,
      headers: browser,
    })),
    {
      source: 'bluesky',
      lang,
      query,
      url: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=100&sort=top&lang=${lang}&since=${since.toISOString()}`,
      headers: { 'user-agent': BROWSER_UA },
    },
  ];
  // Hacker News is an English forum: asking it in other languages finds nothing.
  if (lang === 'en')
    requests.push({
      source: 'hn',
      lang,
      query,
      url: `https://hn.algolia.com/api/v1/search?query=${q}&tags=story&numericFilters=created_at_i%3E${Math.floor(since.getTime() / 1000)}&hitsPerPage=100`,
      headers: { 'user-agent': BROWSER_UA },
    });
  return requests;
}

export interface SearchResult {
  request: SearchRequest;
  status: number;
  items: RawItem[];
}

/** Runs one search and parses what came back; a failed request gives no pieces, not an error. */
export async function runSearch(
  fetcher: Fetcher,
  request: SearchRequest,
  capturedAt: string,
): Promise<SearchResult> {
  let status = 0;
  let body = '';
  try {
    const res = await fetcher(request.url, { headers: request.headers, timeoutMs: 25_000 });
    status = res.status;
    body = res.body;
  } catch {
    return { request, status, items: [] };
  }
  const record: CaptureRecord = {
    source: request.source,
    key: `${request.lang}-${request.query}`,
    url: request.url,
    status,
    bytes: body.length,
    file: null,
    capturedAt,
    meta: { query: request.query, lang: request.lang },
  };
  const parse = parsers[request.source];
  const items = status === 200 && parse ? safe(() => parse(body, record)) : [];
  return { request, status, items: items.map((i) => ({ ...i, query: `vigia:${request.query}` })) };
}

function safe(fn: () => RawItem[]): RawItem[] {
  try {
    return fn();
  } catch {
    return [];
  }
}
