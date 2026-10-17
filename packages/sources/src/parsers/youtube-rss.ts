/**
 * YouTube channel feeds (`/feeds/videos.xml?channel_id=…`): the last 15 videos of a channel with
 * exact dates, views and likes. They show what the AI channels the team follows are publishing
 * and how it does; they do not count for growth, since a busy channel's feed covers few days.
 */
import { XMLParser } from 'fast-xml-parser';
import type { RawItem } from '@radar/core';
import type { Parser } from '../types';

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

type Node = Record<string, unknown>;
const text = (v: unknown): string | undefined =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : ((v as Node | undefined)?.['#text'] as string | undefined);
const list = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : []);
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const parseYoutubeRss: Parser = (body, record) => {
  const feed = (xml.parse(body) as Node).feed as Node | undefined;
  if (!feed) return [];
  const channelId = text(feed['yt:channelId']) ?? String(record.meta.channelId ?? '');
  const channelName =
    text((feed.author as Node | undefined)?.name) ?? text(feed.title) ?? channelId;
  return list(feed.entry).flatMap((entry): RawItem[] => {
    const videoId = text(entry['yt:videoId']);
    const published = text(entry.published);
    if (!videoId || !published) return [];
    const href =
      list(entry.link)
        .map((l) => l['@_href'] as string | undefined)
        .find(Boolean) ?? `https://www.youtube.com/watch?v=${videoId}`;
    const group = (entry['media:group'] as Node | undefined) ?? {};
    const community = (group['media:community'] as Node | undefined) ?? {};
    const views = num((community['media:statistics'] as Node | undefined)?.['@_views']);
    const likes = num((community['media:starRating'] as Node | undefined)?.['@_count']);
    const description = text(group['media:description']) ?? '';
    return [
      {
        platform: 'youtube',
        source: 'youtube-channel',
        externalId: videoId,
        url: href,
        author: { id: channelId, name: channelName },
        publishedAt: new Date(published).toISOString(),
        title: text(entry.title) ?? text(group['media:title']),
        text: description.slice(0, 600),
        format: href.includes('/shorts/') ? 'short' : 'video',
        metrics: {
          ...(views !== undefined ? { views } : {}),
          ...(likes !== undefined ? { likes } : {}),
        },
        capturedAt: record.capturedAt,
      },
    ];
  });
};
