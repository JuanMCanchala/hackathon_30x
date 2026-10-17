/**
 * LinkedIn search by keyword, through the Apify actor `harvestapi/linkedin-post-search`
 * ("No Cookies": it uses no LinkedIn account of ours). It is the only paid source: USD 0.002 per
 * post on the free tier, so every call reports what it cost.
 */
import type { Format, RawItem } from '@radar/core';
import { type Fetcher, httpFetch } from './http';
import { compact, num, str, toIso, truncate } from './util';

export const LINKEDIN_POST_USD = 0.002;
/** Charged once per run, per GB of memory (the actor runs on 256 MB, so one event). */
export const APIFY_START_USD = 0.00005;

const ACTOR = 'harvestapi~linkedin-post-search';

/** What a search costs, so the radar can show the week's bill. */
export function linkedinSearchCost(posts: number, runs = 1): number {
  return Math.round((posts * LINKEDIN_POST_USD + runs * APIFY_START_USD) * 1e6) / 1e6;
}

export interface LinkedinSearchOptions {
  token: string;
  queries: string[];
  /** Per query. LinkedIn stops at about 400-500 posts for one query. */
  maxPosts?: number;
  postedLimit?: 'any' | '1h' | '24h' | 'week' | 'month' | '3months' | '6months' | 'year';
  sortBy?: 'date' | 'relevance';
  /** A hard ceiling on what the run may charge. */
  maxTotalChargeUsd?: number;
  timeoutSecs?: number;
  fetcher?: Fetcher;
  /** ISO 8601; when the counts were read. Defaults to now. */
  now?: string;
}

/** One dataset item, as documented in the actor's README. */
export interface HarvestPost {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  query?: string;
  searchQuery?: string;
  author?: {
    publicIdentifier?: string | null;
    universalName?: string | null;
    type?: string;
    name?: string;
    linkedinUrl?: string;
    info?: string;
    followers?: number;
  };
  postedAt?: { timestamp?: number; date?: string };
  postImages?: unknown[];
  postVideo?: unknown;
  document?: unknown;
  article?: unknown;
  engagement?: { likes?: number; comments?: number; shares?: number };
}

function formatOf(post: HarvestPost): Format {
  if (post.postVideo) return 'video';
  if (post.document) return 'carousel';
  const images = post.postImages?.length ?? 0;
  if (images > 1) return 'carousel';
  if (images === 1) return 'image';
  if (post.article) return 'article';
  return 'post';
}

export function harvestItem(
  post: HarvestPost,
  capturedAt: string,
  query?: string,
): RawItem | undefined {
  const id = post.id ?? post.linkedinUrl?.match(/activity[-:](\d{10,})/)?.[1];
  if (!id || !post.linkedinUrl) return undefined;
  const author = post.author ?? {};
  const handle = str(author.publicIdentifier) ?? str(author.universalName);
  return compact<RawItem>({
    platform: 'linkedin',
    source: 'linkedin-search',
    externalId: id,
    url: post.linkedinUrl.split('?')[0]!,
    author: compact({
      id: (handle ?? author.name ?? '').toLowerCase(),
      name: author.name ?? handle ?? '',
      handle,
      url: author.linkedinUrl?.split('?')[0],
      followers: num(author.followers),
    }),
    publishedAt: toIso(post.postedAt?.timestamp) ?? toIso(post.postedAt?.date) ?? capturedAt,
    text: truncate(post.content ?? '', 3000),
    format: formatOf(post),
    metrics: compact({
      likes: num(post.engagement?.likes),
      comments: num(post.engagement?.comments),
      shares: num(post.engagement?.shares),
    }),
    capturedAt,
    query: str(post.query) ?? str(post.searchQuery) ?? query,
  });
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApifyError';
  }
}

/**
 * Runs the search and waits for its dataset (Apify's synchronous endpoint, up to five minutes).
 * The token goes in the URL as Apify expects; it never appears in errors or results.
 */
export async function linkedinPostSearch(
  options: LinkedinSearchOptions,
): Promise<{ items: RawItem[]; costUsd: number }> {
  const fetcher = options.fetcher ?? httpFetch;
  const now = options.now ?? new Date().toISOString();
  const params = new URLSearchParams({
    token: options.token,
    timeout: String(options.timeoutSecs ?? 300),
  });
  if (options.maxTotalChargeUsd !== undefined) {
    params.set('maxTotalChargeUsd', String(options.maxTotalChargeUsd));
  }
  const input = {
    searchQueries: options.queries,
    maxPosts: options.maxPosts ?? 50,
    postedLimit: options.postedLimit ?? 'week',
    sortBy: options.sortBy ?? 'relevance',
    profileScraperMode: 'short',
    scrapeReactions: false,
    scrapeComments: false,
  };
  const res = await fetcher(
    `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?${params}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(input),
      timeoutMs: ((options.timeoutSecs ?? 300) + 30) * 1000,
    },
  );
  if (res.status < 200 || res.status >= 300) {
    let message = `Apify answered ${res.status}`;
    try {
      const error = (JSON.parse(res.body) as { error?: { message?: string } }).error?.message;
      if (error) message = `${message}: ${error}`;
    } catch {
      // The status alone says enough.
    }
    throw new ApifyError(message, res.status);
  }
  const posts = JSON.parse(res.body) as HarvestPost[];
  const single = options.queries.length === 1 ? options.queries[0] : undefined;
  const items = (Array.isArray(posts) ? posts : [])
    .filter((p) => (p.type ?? 'post') === 'post')
    .map((p) => harvestItem(p, now, single))
    .filter((i): i is RawItem => i !== undefined);
  return { items, costUsd: linkedinSearchCost(posts.length) };
}
