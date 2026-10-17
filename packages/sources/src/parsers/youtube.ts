/**
 * YouTube search results (the "this week" filter), from the `ytInitialData` the page embeds.
 *
 * Regular results (`videoRenderer`) carry title, channel, views, length and a relative date.
 * Shorts come as `shortsLockupViewModel` with only title and views: no channel and no date. They
 * keep `author.id` empty (unknown, so they must not count as a creator) and take the capture time
 * as an approximate publication date, which the week filter keeps within the last seven days.
 */
import type { RawItem } from '@radar/core';
import type { Parser } from '../types';
import {
  compact,
  extractAssignedJson,
  findAll,
  parseCount,
  parseDuration,
  parseRelativeTime,
  str,
} from '../util';

interface Runs {
  runs?: { text?: string; navigationEndpoint?: Endpoint }[];
  simpleText?: string;
}

interface Endpoint {
  commandMetadata?: { webCommandMetadata?: { url?: string } };
  browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string };
}

interface VideoRenderer {
  videoId?: string;
  title?: Runs;
  ownerText?: Runs;
  longBylineText?: Runs;
  publishedTimeText?: Runs;
  lengthText?: Runs;
  viewCountText?: Runs;
  descriptionSnippet?: Runs;
  detailedMetadataSnippets?: { snippetText?: Runs }[];
  navigationEndpoint?: Endpoint;
}

interface ShortsLockup {
  onTap?: {
    innertubeCommand?: {
      reelWatchEndpoint?: { videoId?: string };
      commandMetadata?: { webCommandMetadata?: { url?: string } };
    };
  };
  overlayMetadata?: {
    primaryText?: { content?: string };
    secondaryText?: { content?: string };
  };
  accessibilityText?: string;
}

const text = (r: Runs | undefined): string =>
  r?.simpleText ?? r?.runs?.map((x) => x.text ?? '').join('') ?? '';

export const parseYoutube: Parser = (body, record) => {
  const data = extractAssignedJson(body, 'var ytInitialData');
  if (!data) return [];
  const query = str(record.meta.query);
  const items: RawItem[] = [];
  const seen = new Set<string>();

  for (const node of findAll(data, 'videoRenderer') as VideoRenderer[]) {
    const id = node.videoId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const owner = (node.ownerText ?? node.longBylineText)?.runs?.[0];
    const browse = owner?.navigationEndpoint?.browseEndpoint;
    const durationSec = parseDuration(node.lengthText?.simpleText);
    const published = parseRelativeTime(text(node.publishedTimeText), record.capturedAt);
    const snippet =
      text(node.descriptionSnippet) ||
      (node.detailedMetadataSnippets ?? []).map((s) => text(s.snippetText)).join(' ');
    const title = text(node.title);
    const watchUrl = node.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ?? '';
    items.push(
      compact<RawItem>({
        platform: 'youtube',
        source: 'youtube-search',
        externalId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        author: compact({
          id: browse?.browseId ?? owner?.text ?? '',
          name: owner?.text ?? '',
          handle: browse?.canonicalBaseUrl?.replace(/^\//, ''),
          url: browse?.canonicalBaseUrl
            ? `https://www.youtube.com${browse.canonicalBaseUrl}`
            : undefined,
        }),
        publishedAt: published ?? record.capturedAt,
        publishedApprox: true,
        title,
        text: [title, snippet].filter(Boolean).join('\n'),
        format:
          watchUrl.startsWith('/shorts/') || (durationSec !== undefined && durationSec <= 60)
            ? 'short'
            : 'video',
        durationSec,
        metrics: compact({ views: parseCount(text(node.viewCountText)) }),
        capturedAt: record.capturedAt,
        query,
      }),
    );
  }

  for (const node of findAll(data, 'shortsLockupViewModel') as ShortsLockup[]) {
    const command = node.onTap?.innertubeCommand;
    const id =
      command?.reelWatchEndpoint?.videoId ??
      command?.commandMetadata?.webCommandMetadata?.url?.match(/\/shorts\/([\w-]+)/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = node.overlayMetadata?.primaryText?.content ?? '';
    items.push(
      compact<RawItem>({
        platform: 'youtube',
        source: 'youtube-search',
        externalId: id,
        url: `https://www.youtube.com/shorts/${id}`,
        author: { id: '', name: '' },
        publishedAt: record.capturedAt,
        publishedApprox: true,
        title,
        text: title,
        format: 'short',
        metrics: compact({ views: parseCount(node.overlayMetadata?.secondaryText?.content) }),
        capturedAt: record.capturedAt,
        query,
      }),
    );
  }
  return items;
};
