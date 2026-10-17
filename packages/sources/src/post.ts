/**
 * The community sensor's reader: a link that someone saw working becomes a piece, read from the
 * post's public page (no login) with the counts it shows right now.
 *
 * Supported: LinkedIn posts, YouTube videos and shorts, TikTok videos, X posts, Bluesky posts and
 * Instagram posts or reels. Anything else, or a page that no longer answers, gives null.
 */
import type { RawItem } from '@radar/core';
import { BROWSER_UA, type Fetcher, httpFetch } from './http';
import { blueskyItem, type BlueskyPost } from './parsers/bluesky';
import { ldPostings, linkedinItem, tweetItem } from './parsers/social';
import {
  compact,
  decodeEntities,
  extractAssignedJson,
  extractScriptJson,
  num,
  parseCount,
  str,
  toIso,
  truncate,
} from './util';

export interface ReadPostOptions {
  fetcher?: Fetcher;
  /** ISO 8601; the moment the counts are read. Defaults to now. */
  now?: string;
}

const SOURCE = 'sensor';
const browser = { 'user-agent': BROWSER_UA, 'accept-language': 'es-419,es;q=0.9,en;q=0.8' };

export async function readPublicPost(
  url: string,
  options: ReadPostOptions = {},
): Promise<RawItem | null> {
  let target: URL;
  try {
    target = new URL(url.trim());
  } catch {
    return null;
  }
  const fetcher = options.fetcher ?? httpFetch;
  const now = options.now ?? new Date().toISOString();
  const host = target.hostname.replace(/^(www|m|mobile)\./, '');
  try {
    if (host.endsWith('linkedin.com')) return await readLinkedin(target, fetcher, now);
    if (host === 'youtube.com' || host === 'youtu.be')
      return await readYoutube(target, fetcher, now);
    if (host.endsWith('tiktok.com')) return await readTiktok(target, fetcher, now);
    if (host === 'x.com' || host === 'twitter.com') return await readX(target, fetcher, now);
    if (host === 'bsky.app') return await readBluesky(target, fetcher, now);
    if (host === 'instagram.com') return await readInstagram(target, fetcher, now);
  } catch {
    return null;
  }
  return null;
}

async function readLinkedin(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const res = await fetcher(url.toString(), { headers: browser });
  if (res.status !== 200) return null;
  const [node] = ldPostings(res.body);
  if (!node) return null;
  const item = linkedinItem({ url: url.toString().split('?')[0], ...node }, now, {
    source: SOURCE,
  });
  if (!item) return null;
  // The page also prints the counts as attributes; they fill what the JSON-LD left out.
  const reactions = res.body.match(/data-num-reactions="(\d+)"/)?.[1];
  const comments = res.body.match(/data-num-comments="(\d+)"/)?.[1];
  // The author's block in the JSON-LD carries its followers as a FollowAction counter.
  const followers = res.body.match(/FollowAction","userInteractionCount":(\d+)/)?.[1];
  return {
    ...item,
    author: compact({ ...item.author, followers: item.author.followers ?? num(followers) }),
    metrics: compact({
      ...item.metrics,
      likes: item.metrics.likes ?? num(reactions),
      comments: item.metrics.comments ?? num(comments),
    }),
  };
}

interface PlayerResponse {
  videoDetails?: {
    videoId?: string;
    title?: string;
    lengthSeconds?: string;
    channelId?: string;
    shortDescription?: string;
    viewCount?: string;
    author?: string;
  };
  microformat?: {
    playerMicroformatRenderer?: {
      publishDate?: string;
      uploadDate?: string;
      ownerProfileUrl?: string;
      externalChannelId?: string;
    };
  };
}

function youtubeId(url: URL): string | undefined {
  if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1).split('/')[0];
  if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
  return url.searchParams.get('v') ?? undefined;
}

/** "like this video along with 12,345 other people" or its Spanish version, else a likeCount field. */
function youtubeLikes(html: string): number | undefined {
  const sentence =
    html.match(/along with ([\d.,]+) other (?:people|person)/i)?.[1] ??
    html.match(/junto con otras? ([\d.,]+) personas?/i)?.[1];
  if (sentence) return parseCount(sentence);
  const field = html.match(/"likeCount"\s*:\s*"?(\d+)"?/)?.[1];
  return field ? Number(field) : undefined;
}

async function readYoutube(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const id = youtubeId(url);
  if (!id || !/^[\w-]{6,}$/.test(id)) return null;
  const res = await fetcher(`https://www.youtube.com/watch?v=${id}`, {
    headers: { ...browser, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (res.status !== 200) return null;
  const player = extractAssignedJson(res.body, 'var ytInitialPlayerResponse') as
    PlayerResponse | undefined;
  const details = player?.videoDetails;
  if (!details?.videoId) return null;
  const micro = player?.microformat?.playerMicroformatRenderer;
  const length = num(details.lengthSeconds);
  const handle = micro?.ownerProfileUrl?.match(/youtube\.com\/(@[^/?#]+)/)?.[1];
  // The page prints both as short text: "1.93M subscribers", and "3K" atop the comments panel.
  const subscribers = res.body.match(
    /"subscriberCountText":\{[^}]*\}\},"simpleText":"([\d.,]+\s*[KkMm]?) subscribers?"/,
  )?.[1];
  const comments = res.body.match(
    /"contextualInfo":\{"runs":\[\{"text":"([\d.,]+\s*[KkMm]?)"\}\]\}/,
  )?.[1];
  const channelId = details.channelId ?? micro?.externalChannelId ?? '';
  return compact<RawItem>({
    platform: 'youtube',
    source: SOURCE,
    externalId: details.videoId,
    url: `https://www.youtube.com/watch?v=${details.videoId}`,
    author: compact({
      id: channelId,
      name: details.author ?? '',
      handle,
      url: handle ? `https://www.youtube.com/${handle}` : undefined,
      followers: parseCount(subscribers),
    }),
    publishedAt: toIso(micro?.publishDate) ?? toIso(micro?.uploadDate) ?? now,
    title: details.title,
    text: [details.title, truncate(details.shortDescription ?? '', 1500)]
      .filter(Boolean)
      .join('\n'),
    format:
      url.pathname.startsWith('/shorts/') || (length !== undefined && length <= 60)
        ? 'short'
        : 'video',
    durationSec: length,
    metrics: compact({
      views: num(details.viewCount),
      likes: youtubeLikes(res.body),
      comments: parseCount(comments),
    }),
    capturedAt: now,
  });
}

interface TiktokItem {
  id?: string;
  desc?: string;
  createTime?: string | number;
  author?: { uniqueId?: string; nickname?: string; id?: string };
  authorStats?: { followerCount?: number };
  stats?: Record<string, number | string>;
  statsV2?: Record<string, number | string>;
  video?: { duration?: number };
}

async function readTiktok(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const res = await fetcher(url.toString(), { headers: browser });
  if (res.status !== 200) return null;
  const [data] = extractScriptJson(res.body, /id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["']/) as {
    __DEFAULT_SCOPE__?: Record<string, { itemInfo?: { itemStruct?: TiktokItem } }>;
  }[];
  const item = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
  if (!item?.id || !item.author?.uniqueId) return null;
  // statsV2 holds exact counts as strings; stats may be rounded.
  const stat = (key: string) => num(item.statsV2?.[key]) ?? num(item.stats?.[key]);
  const user = item.author.uniqueId;
  return compact<RawItem>({
    platform: 'tiktok',
    source: SOURCE,
    externalId: item.id,
    url: `https://www.tiktok.com/@${user}/video/${item.id}`,
    author: compact({
      id: user.toLowerCase(),
      name: item.author.nickname ?? user,
      handle: user,
      url: `https://www.tiktok.com/@${user}`,
      followers: num(item.authorStats?.followerCount),
    }),
    publishedAt: toIso(num(item.createTime)) ?? now,
    text: item.desc ?? '',
    format: 'short',
    durationSec: num(item.video?.duration),
    metrics: compact({
      views: stat('playCount'),
      likes: stat('diggCount'),
      comments: stat('commentCount'),
      shares: stat('shareCount'),
      saves: stat('collectCount'),
    }),
    capturedAt: now,
  });
}

/** The token the public embed endpoint expects, the same one Twitter's own embeds compute. */
export function tweetToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(6 ** 2).replace(/(0+|\.)/g, '');
}

async function readX(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const id = url.pathname.match(/\/status(?:es)?\/(\d+)/)?.[1];
  if (!id) return null;
  const res = await fetcher(
    `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${tweetToken(id)}&lang=es`,
    { headers: browser },
  );
  if (res.status !== 200) return null;
  const tweet = JSON.parse(res.body) as {
    id_str?: string;
    text?: string;
    created_at?: string;
    lang?: string;
    favorite_count?: number;
    conversation_count?: number;
    user?: { screen_name?: string; name?: string };
    mediaDetails?: { type?: string }[];
  };
  return (
    tweetItem(
      {
        id_str: tweet.id_str,
        full_text: tweet.text,
        created_at: tweet.created_at,
        lang: tweet.lang,
        favorite_count: tweet.favorite_count,
        reply_count: tweet.conversation_count,
        user: tweet.user,
        extended_entities: { media: tweet.mediaDetails },
      },
      now,
      SOURCE,
    ) ?? null
  );
}

async function readBluesky(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([\w]+)/);
  if (!match) return null;
  const rkey = match[2]!;
  let actor = match[1]!;
  if (!actor.startsWith('did:')) {
    const res = await fetcher(
      `https://api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
      { headers: browser },
    );
    if (res.status !== 200) return null;
    const did = (JSON.parse(res.body) as { did?: string }).did;
    if (!did) return null;
    actor = did;
  }
  const uri = `at://${actor}/app.bsky.feed.post/${rkey}`;
  const res = await fetcher(
    `https://api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`,
    { headers: browser },
  );
  if (res.status !== 200) return null;
  const post = (JSON.parse(res.body) as { thread?: { post?: BlueskyPost } }).thread?.post;
  const item = post ? blueskyItem(post, now) : undefined;
  return item ? { ...item, source: SOURCE } : null;
}

/** "241 likes, 145 comments - andresbilbao on September 20, 2026: "caption"." */
const IG_DESCRIPTION =
  /^([\d.,]+\s*[KkMm]?)\s+likes?,\s*([\d.,]+\s*[KkMm]?)\s+comments?\s+-\s+([\w.]+)\s+(?:on|el)\s+(.+?):\s*[“"]([\s\S]*)[”"]\.?\s*$/;

/**
 * Instagram's post page has no data for browsers without a session, but its link preview tags
 * (what a crawler sees) still say likes, comments, author, date and caption.
 */
async function readInstagram(url: URL, fetcher: Fetcher, now: string): Promise<RawItem | null> {
  const match = url.pathname.match(/\/(p|reel|reels|tv)\/([\w-]+)/);
  if (!match) return null;
  const [, kind, shortcode] = match;
  const res = await fetcher(
    `https://www.instagram.com/${kind === 'p' ? 'p' : 'reel'}/${shortcode}/`,
    {
      headers: {
        'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
  );
  if (res.status !== 200) return null;
  const meta = (property: string) =>
    decodeEntities(
      res.body.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`))?.[1] ??
        '',
    );
  const description = meta('og:description') || meta('description');
  const parsed = description.match(IG_DESCRIPTION);
  const ogUrl = meta('og:url');
  const username = parsed?.[3] ?? ogUrl.match(/instagram\.com\/([\w.]+)\/(?:p|reel)\//)?.[1] ?? '';
  const isReel = kind !== 'p' || /\/reel\//.test(ogUrl);
  if (!parsed && !meta('og:title')) return null;
  return compact<RawItem>({
    platform: 'instagram',
    source: SOURCE,
    externalId: shortcode!,
    url: `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${shortcode}/`,
    author: compact({
      id: username.toLowerCase(),
      name: username,
      handle: str(username),
      url: username ? `https://www.instagram.com/${username}/` : undefined,
    }),
    publishedAt: toIso(parsed?.[4]) ?? now,
    publishedApprox: parsed?.[4] ? undefined : true,
    text: parsed?.[5]?.trim() ?? meta('og:title'),
    format: isReel ? 'reel' : 'image',
    metrics: compact({ likes: parseCount(parsed?.[1]), comments: parseCount(parsed?.[2]) }),
    capturedAt: now,
  });
}
