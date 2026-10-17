/**
 * The shared vocabulary of the radar: a piece of public content, read from one platform at one
 * moment, with the engagement it had then.
 */

/** Where a piece was published. */
export type Platform =
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'bluesky'
  | 'hn'
  | 'github'
  | 'huggingface'
  | 'arxiv'
  | 'news'
  | 'newsletter'
  | 'producthunt';

/** Where 30X publishes and where its audience reads: the waves it wants to ride. */
export const MAINSTREAM: readonly Platform[] = ['linkedin', 'instagram', 'tiktok', 'youtube'];
/** Where AI waves usually form first: builders, researchers and early adopters. */
export const TECHNICAL: readonly Platform[] = [
  'hn',
  'github',
  'huggingface',
  'arxiv',
  'x',
  'bluesky',
];
/** Press and curation: what the news and the newsletters picked up. */
export const MEDIA: readonly Platform[] = ['news', 'newsletter', 'producthunt'];

export type Lane = 'mainstream' | 'technical' | 'media';

export function laneOf(platform: Platform): Lane {
  if (MAINSTREAM.includes(platform)) return 'mainstream';
  if (TECHNICAL.includes(platform)) return 'technical';
  return 'media';
}

export type Format =
  | 'post'
  | 'carousel'
  | 'image'
  | 'reel'
  | 'short'
  | 'video'
  | 'article'
  | 'thread'
  | 'repo'
  | 'model'
  | 'paper'
  | 'news'
  | 'launch'
  | 'other';

export interface Author {
  /** Stable within the platform: handle, channel id, company slug or repo owner. */
  id: string;
  name: string;
  handle?: string;
  url?: string;
  followers?: number;
}

/** What the platform shows. Likes also hold reactions, stars, upvotes and points. */
export interface Metrics {
  views?: number;
  likes?: number;
  comments?: number;
  /** Reposts, retweets, shares and quotes. */
  shares?: number;
  saves?: number;
}

export interface RawItem {
  platform: Platform;
  /** The reader that produced it, e.g. 'youtube-search', 'bluesky-search', 'linkedin-company'. */
  source: string;
  /** The id within the platform. Together with `platform` it identifies the piece. */
  externalId: string;
  url: string;
  author: Author;
  /** ISO 8601. */
  publishedAt: string;
  /** True when the platform only said something like "hace 2 días". */
  publishedApprox?: boolean;
  title?: string;
  /** Caption, body, or title plus description. May be empty for pure media. */
  text: string;
  format: Format;
  /** ISO 639-1 when known. */
  lang?: string;
  durationSec?: number;
  metrics: Metrics;
  /** ISO 8601: when these metrics were read. */
  capturedAt: string;
  /** The search query that found it, if it came from a search. */
  query?: string;
}

/** A dated value: a day (YYYY-MM-DD) or the Monday that starts a week. */
export interface Point {
  date: string;
  value: number;
}
