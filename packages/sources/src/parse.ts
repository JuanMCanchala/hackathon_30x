/**
 * From raw captures to pieces: each capture group has its parser, and a run becomes one list
 * without repeats.
 */
import type { RawItem } from '@radar/core';
import { parseBluesky } from './parsers/bluesky';
import { parseNews, parseNewsletters } from './parsers/feeds';
import { parseInstagram, parseLinkedin, parseX } from './parsers/social';
import { parseArxiv, parseGithub, parseHn, parseHuggingface } from './parsers/technical';
import { parseYoutube } from './parsers/youtube';
import { parseYoutubeRss } from './parsers/youtube-rss';
import { readRun } from './raw';
import type { CaptureRecord, Parser } from './types';
import { compact } from './util';

/** Keyed by the capture group name used in `scripts/capture.mjs`. */
export const parsers: Record<string, Parser> = {
  youtube: parseYoutube,
  youtube_rss: parseYoutubeRss,
  bluesky: parseBluesky,
  news: parseNews,
  newsletters: parseNewsletters,
  hn: parseHn,
  github: parseGithub,
  huggingface: parseHuggingface,
  arxiv: parseArxiv,
  x: parseX,
  instagram: parseInstagram,
  linkedin: parseLinkedin,
};

/** One response through its parser; unknown groups and parser errors give no pieces. */
export function parseRecord(body: string, record: CaptureRecord): RawItem[] {
  const parser = parsers[record.source];
  if (!parser) return [];
  try {
    return parser(body, record);
  } catch {
    return [];
  }
}

export const itemKey = (item: Pick<RawItem, 'platform' | 'externalId'>): string =>
  `${item.platform}:${item.externalId}`;

/**
 * Keeps one piece per platform and id. The newer capture leads, since its counts are fresher,
 * but nothing the other one knew is lost: a known author beats an unknown one (shorts come
 * without a channel), an exact date beats an approximate one (trending repos have no date),
 * and a count missing in one is taken from the other.
 */
export function merge(a: RawItem, b: RawItem): RawItem {
  const [older, newer] = a.capturedAt <= b.capturedAt ? [a, b] : [b, a];
  const exactDate = newer.publishedApprox && !older.publishedApprox ? older : newer;
  return compact<RawItem>({
    ...older,
    ...newer,
    author: newer.author.id ? { ...older.author, ...newer.author } : older.author,
    publishedAt: exactDate.publishedAt,
    publishedApprox: exactDate.publishedApprox,
    title: newer.title ?? older.title,
    text: newer.text.length >= older.text.length ? newer.text : older.text,
    durationSec: newer.durationSec ?? older.durationSec,
    lang: newer.lang ?? older.lang,
    metrics: { ...older.metrics, ...newer.metrics },
    query: newer.query ?? older.query,
  });
}

export function dedupe(items: RawItem[]): RawItem[] {
  const byKey = new Map<string, RawItem>();
  for (const item of items) {
    const key = itemKey(item);
    const current = byKey.get(key);
    byKey.set(key, current ? merge(current, item) : item);
  }
  return [...byKey.values()];
}

/** Every piece of one capture run, without repeats. */
export async function parseRun(runDir: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  for await (const { record, body } of readRun(runDir)) items.push(...parseRecord(body, record));
  return dedupe(items);
}
