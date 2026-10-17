/**
 * RSS 2.0 and Atom feeds: Google News searches, AI newsletters and Product Hunt's AI feed.
 * Feeds carry no engagement; they say what the press and the curators picked up, and when.
 */
import { XMLParser } from 'fast-xml-parser';
import type { RawItem } from '@radar/core';
import type { Parser } from '../types';
import { compact, langOf, stripHtml, str, toIso, truncate } from '../util';

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => name === 'item' || name === 'entry' || name === 'link',
  processEntities: true,
  htmlEntities: true,
});

type Node = Record<string, unknown>;

/** Text of an element that may be a string, a number, or `{ '#text': … }` when it has attributes. */
function txt(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) return txt((value as Node)['#text']);
  return undefined;
}

function attr(value: unknown, name: string): string | undefined {
  return value && typeof value === 'object' ? str((value as Node)[`@_${name}`]) : undefined;
}

/** Atom has several <link>s; the alternate one (or the first) is the page. */
function atomLink(links: unknown): string | undefined {
  const list = (Array.isArray(links) ? links : [links]) as unknown[];
  const alternate = list.find((l) => (attr(l, 'rel') ?? 'alternate') === 'alternate') ?? list[0];
  return attr(alternate, 'href') ?? txt(alternate);
}

interface FeedEntry {
  id: string;
  url: string;
  title: string;
  summary: string;
  publishedAt?: string;
  author?: string;
  sourceName?: string;
  sourceUrl?: string;
}

interface Feed {
  title?: string;
  lang?: string;
  entries: FeedEntry[];
}

export function readFeed(body: string): Feed {
  let doc: Node;
  try {
    doc = xml.parse(body) as Node;
  } catch {
    return { entries: [] };
  }
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined;
  if (channel) {
    const entries = ((channel.item as Node[] | undefined) ?? []).map((item): FeedEntry => {
      const link = Array.isArray(item.link) ? item.link[0] : item.link;
      const url = txt(link) ?? '';
      const encoded = txt(item['content:encoded']);
      const description = stripHtml(txt(item.description));
      return {
        id: txt(item.guid) ?? url,
        url,
        title: stripHtml(txt(item.title)),
        summary: truncate(
          [description, encoded ? stripHtml(encoded) : ''].filter(Boolean).join('\n'),
          1200,
        ),
        publishedAt: toIso(txt(item.pubDate)) ?? toIso(txt(item['dc:date'])),
        author: txt(item['dc:creator']) ?? txt(item.author),
        sourceName: txt(item.source),
        sourceUrl: attr(item.source, 'url'),
      };
    });
    return { title: stripHtml(txt(channel.title)), lang: txt(channel.language), entries };
  }
  const feed = doc.feed as Node | undefined;
  if (feed) {
    const entries = ((feed.entry as Node[] | undefined) ?? []).map((entry): FeedEntry => {
      const url = atomLink(entry.link) ?? '';
      // arXiv lists every author; the first one names the piece.
      const author = (Array.isArray(entry.author) ? entry.author[0] : entry.author) as
        Node | undefined;
      return {
        id: txt(entry.id) ?? url,
        url,
        title: stripHtml(txt(entry.title)),
        summary: truncate(stripHtml(txt(entry.content) ?? txt(entry.summary)), 1200),
        publishedAt: toIso(txt(entry.published)) ?? toIso(txt(entry.updated)),
        author: txt(author?.name),
      };
    });
    return { title: stripHtml(txt(feed.title)), lang: attr(feed, 'xml:lang'), entries };
  }
  return { entries: [] };
}

/** Google News appends " - Source" to every headline; the source is the author. */
export const parseNews: Parser = (body, record) => {
  const feed = readFeed(body);
  const lang = langOf(feed.lang) ?? str(record.meta.lang);
  const query = str(record.meta.query);
  return feed.entries
    .filter((e) => e.url && e.title)
    .map((e) => {
      const source = e.sourceName ?? '';
      const title =
        source && e.title.endsWith(` - ${source}`)
          ? e.title.slice(0, -(source.length + 3))
          : e.title;
      return compact<RawItem>({
        platform: 'news',
        source: 'google-news',
        externalId: e.id,
        url: e.url,
        author: compact({
          id: e.sourceUrl ?? source,
          name: source,
          url: e.sourceUrl,
        }),
        publishedAt: e.publishedAt ?? record.capturedAt,
        title,
        text: title,
        format: 'news',
        lang,
        metrics: {},
        capturedAt: record.capturedAt,
        query,
      });
    });
};

export const parseNewsletters: Parser = (body, record) => {
  const feed = readFeed(body);
  const feedUrl = str(record.meta.feed) ?? record.url;
  const isProductHunt = /producthunt\.com/.test(feedUrl);
  const lang = langOf(feed.lang);
  const publication = feed.title ?? new URL(feedUrl).hostname;
  return feed.entries
    .filter((e) => e.url && e.title)
    .map((e) => {
      // Product Hunt entries end with "Discussion | Link", two links that say nothing.
      const summary = e.summary.replace(/\s*Discussion\s*\|\s*Link\s*$/i, '').trim();
      return compact<RawItem>({
        platform: isProductHunt ? 'producthunt' : 'newsletter',
        source: isProductHunt ? 'producthunt-feed' : 'newsletter-feed',
        externalId: e.id,
        url: e.url,
        author: isProductHunt
          ? compact({ id: e.author ?? 'producthunt', name: e.author ?? 'Product Hunt' })
          : { id: feedUrl, name: publication, url: feedUrl },
        publishedAt: e.publishedAt ?? record.capturedAt,
        title: e.title,
        text: [e.title, summary].filter(Boolean).join('\n'),
        format: isProductHunt ? 'launch' : 'article',
        lang,
        metrics: {},
        capturedAt: record.capturedAt,
      });
    });
};
