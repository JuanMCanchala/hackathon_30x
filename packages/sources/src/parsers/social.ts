/**
 * The social accounts we follow by name: X timelines (embed endpoint), Instagram profiles and
 * LinkedIn company pages. Each one gives real engagement, but only for accounts we already know.
 */
import type { Format, Metrics, RawItem } from '@radar/core';
import type { Parser } from '../types';
import {
  compact,
  extractScriptJson,
  findAll,
  langOf,
  num,
  parseCount,
  str,
  toIso,
  truncate,
} from '../util';

// ---------------------------------------------------------------------------------------------
// X

interface Tweet {
  id_str?: string;
  created_at?: string;
  full_text?: string;
  text?: string;
  lang?: string;
  favorite_count?: number;
  retweet_count?: number;
  quote_count?: number;
  reply_count?: number;
  bookmark_count?: number;
  retweeted_status?: unknown;
  user?: { screen_name?: string; name?: string; followers_count?: number; id_str?: string };
  extended_entities?: { media?: { type?: string }[] };
  entities?: { media?: { type?: string }[] };
}

/** One tweet as a piece. Shared with the sensor, which reads single tweets. */
export function tweetItem(
  tweet: Tweet,
  capturedAt: string,
  source = 'x-timeline',
): RawItem | undefined {
  const id = tweet.id_str;
  const user = tweet.user?.screen_name;
  if (!id || !user) return undefined;
  const media = tweet.extended_entities?.media ?? tweet.entities?.media ?? [];
  const format: Format = media.some((m) => m.type === 'video' || m.type === 'animated_gif')
    ? 'video'
    : media.length
      ? 'image'
      : 'post';
  const text = (tweet.full_text ?? tweet.text ?? '').replace(/\s*https:\/\/t\.co\/\w+\s*$/, '');
  return compact<RawItem>({
    platform: 'x',
    source,
    externalId: id,
    url: `https://x.com/${user}/status/${id}`,
    author: compact({
      id: user.toLowerCase(),
      name: tweet.user?.name ?? user,
      handle: user,
      url: `https://x.com/${user}`,
      followers: num(tweet.user?.followers_count),
    }),
    publishedAt: toIso(tweet.created_at) ?? capturedAt,
    text,
    format,
    lang: langOf(tweet.lang),
    metrics: compact({
      likes: num(tweet.favorite_count),
      comments: num(tweet.reply_count),
      // The single-post endpoint has no retweet count: unknown stays unknown, not zero.
      shares:
        tweet.retweet_count === undefined && tweet.quote_count === undefined
          ? undefined
          : (num(tweet.retweet_count) ?? 0) + (num(tweet.quote_count) ?? 0),
      saves: num(tweet.bookmark_count),
    }),
    capturedAt,
  });
}

/** The embed timeline (`syndication.twitter.com/srv/timeline-profile`): its own tweets, no retweets. */
export const parseX: Parser = (body, record) => {
  const [data] = extractScriptJson(body, /id=["']__NEXT_DATA__["']/);
  if (!data) return [];
  const owner = str(record.meta.handle)?.toLowerCase();
  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (const tweet of findAll(data, 'tweet') as Tweet[]) {
    if (!tweet || typeof tweet !== 'object' || !tweet.id_str || seen.has(tweet.id_str)) continue;
    if (tweet.retweeted_status || /^RT @/.test(tweet.full_text ?? tweet.text ?? '')) continue;
    if (owner && tweet.user?.screen_name && tweet.user.screen_name.toLowerCase() !== owner)
      continue;
    const item = tweetItem(tweet, record.capturedAt);
    if (item) {
      seen.add(tweet.id_str);
      items.push(item);
    }
  }
  return items;
};

// ---------------------------------------------------------------------------------------------
// Instagram

interface IgNode {
  __typename?: string;
  id?: string;
  shortcode?: string;
  product_type?: string | null;
  is_video?: boolean;
  video_view_count?: number | null;
  video_play_count?: number | null;
  taken_at_timestamp?: number;
  edge_liked_by?: { count?: number };
  edge_media_preview_like?: { count?: number };
  edge_media_to_comment?: { count?: number };
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
  owner?: { id?: string; username?: string };
  video_duration?: number;
}

interface IgUser {
  id?: string;
  username?: string;
  full_name?: string;
  edge_followed_by?: { count?: number };
  edge_owner_to_timeline_media?: { edges?: { node?: IgNode }[] };
  edge_felix_video_timeline?: { edges?: { node?: IgNode }[] };
}

function igFormat(node: IgNode): Format {
  if (node.product_type === 'clips') return 'reel';
  if (node.__typename === 'GraphSidecar' || node.__typename === 'XDTGraphSidecar')
    return 'carousel';
  if (node.is_video) return 'video';
  return 'image';
}

/** One profile post as a piece; `user` gives the followers of the profile it came from. */
export function instagramItem(node: IgNode, user: IgUser, capturedAt: string): RawItem | undefined {
  if (!node.shortcode) return undefined;
  const username = node.owner?.username ?? user.username ?? '';
  const sameOwner = !node.owner?.username || node.owner.username === user.username;
  const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '';
  const format = igFormat(node);
  const metrics: Metrics = compact({
    views: num(node.video_view_count) ?? num(node.video_play_count),
    likes: num(node.edge_liked_by?.count) ?? num(node.edge_media_preview_like?.count),
    comments: num(node.edge_media_to_comment?.count),
  });
  return compact<RawItem>({
    platform: 'instagram',
    source: 'instagram-profile',
    externalId: node.shortcode,
    url: `https://www.instagram.com/${format === 'reel' ? 'reel' : 'p'}/${node.shortcode}/`,
    author: compact({
      id: username.toLowerCase(),
      name: sameOwner ? user.full_name || username : username,
      handle: username,
      url: username ? `https://www.instagram.com/${username}/` : undefined,
      followers: sameOwner ? num(user.edge_followed_by?.count) : undefined,
    }),
    publishedAt: toIso(node.taken_at_timestamp) ?? capturedAt,
    text: caption,
    format,
    durationSec: num(node.video_duration),
    metrics,
    capturedAt,
  });
}

/** `web_profile_info`: the latest posts and reels of one profile (pinned ones come first). */
export const parseInstagram: Parser = (body, record) => {
  let data: { data?: { user?: IgUser } };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const user = data.data?.user;
  if (!user) return [];
  const nodes = [
    ...(user.edge_owner_to_timeline_media?.edges ?? []),
    ...(user.edge_felix_video_timeline?.edges ?? []),
  ].map((e) => e.node);
  const items: RawItem[] = [];
  const seen = new Set<string>();
  for (const node of nodes) {
    if (!node?.shortcode || seen.has(node.shortcode)) continue;
    seen.add(node.shortcode);
    const item = instagramItem(node, user, record.capturedAt);
    if (item) items.push(item);
  }
  return items;
};

// ---------------------------------------------------------------------------------------------
// LinkedIn

interface LdNode {
  '@id'?: string;
  '@type'?: string | string[];
  '@graph'?: LdNode[];
  author?: { '@type'?: string; name?: string; url?: string } | { name?: string; url?: string }[];
  datePublished?: string;
  uploadDate?: string;
  text?: string;
  articleBody?: string;
  headline?: string;
  name?: string;
  description?: string;
  url?: string;
  mainEntityOfPage?: string | { '@id'?: string };
  commentCount?: number;
  interactionStatistic?: LdCounter | LdCounter[];
  duration?: string;
}

interface LdCounter {
  interactionType?: string | { '@type'?: string };
  userInteractionCount?: number;
}

function ldTypes(node: LdNode): string[] {
  const t = node['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
}

/** LikeAction → likes, CommentAction → comments, ShareAction → shares. */
export function ldMetrics(node: LdNode): Metrics {
  const metrics: Metrics = {};
  const counters = node.interactionStatistic;
  for (const c of Array.isArray(counters) ? counters : counters ? [counters] : []) {
    const type =
      typeof c.interactionType === 'string'
        ? c.interactionType
        : (c.interactionType?.['@type'] ?? '');
    const value = num(c.userInteractionCount);
    if (value === undefined) continue;
    if (/Like/i.test(type)) metrics.likes = value;
    else if (/Comment/i.test(type)) metrics.comments = value;
    else if (/Share/i.test(type)) metrics.shares = value;
    else if (/Watch|View/i.test(type)) metrics.views = value;
  }
  if (metrics.comments === undefined && num(node.commentCount) !== undefined) {
    metrics.comments = num(node.commentCount);
  }
  return metrics;
}

/** The activity id inside a post URL or URN, which stays the same across the LinkedIn domains. */
export function linkedinActivityId(url: string): string | undefined {
  return (
    url.match(/activity[-:](\d{10,})/)?.[1] ?? url.match(/(?:ugcPost|share)[-:](\d{10,})/)?.[1]
  );
}

/** Every posting in the page's JSON-LD, flattened out of `@graph`. */
export function ldPostings(html: string): LdNode[] {
  const out: LdNode[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      const n = node as LdNode;
      if (n['@graph']) visit(n['@graph']);
      const types = ldTypes(n);
      if (
        types.includes('SocialMediaPosting') ||
        types.includes('VideoObject') ||
        types.includes('DiscussionForumPosting')
      ) {
        out.push(n);
      }
    }
  };
  for (const block of extractScriptJson(html, /type=["']application\/ld\+json["']/)) visit(block);
  return out;
}

/** One JSON-LD posting as a piece. */
export function linkedinItem(
  node: LdNode,
  capturedAt: string,
  extra: { source: string; authorId?: string; followers?: number },
): RawItem | undefined {
  const page =
    typeof node.mainEntityOfPage === 'string'
      ? node.mainEntityOfPage
      : node.mainEntityOfPage?.['@id'];
  const url = node.url ?? page ?? (node['@id']?.startsWith('http') ? node['@id'] : undefined);
  if (!url) return undefined;
  const id = linkedinActivityId(url) ?? url;
  const author = Array.isArray(node.author) ? node.author[0] : node.author;
  const isVideo = ldTypes(node).includes('VideoObject');
  const body =
    node.articleBody ?? node.text ?? node.description ?? node.headline ?? node.name ?? '';
  const authorUrl = author?.url;
  const slug = authorUrl?.match(/linkedin\.com\/(?:company|in|school|showcase)\/([^/?#]+)/)?.[1];
  return compact<RawItem>({
    platform: 'linkedin',
    source: extra.source,
    externalId: id,
    url: url.replace(/^https?:\/\/[a-z]{2,3}\.linkedin\.com/, 'https://www.linkedin.com'),
    author: compact({
      // A company page can show reposts: the posting's own author wins over the page it came from.
      id: (slug ?? extra.authorId ?? author?.name ?? '').toLowerCase(),
      name: author?.name ?? '',
      handle: slug,
      url: authorUrl?.replace(/^https?:\/\/[a-z]{2,3}\.linkedin\.com/, 'https://www.linkedin.com'),
      followers:
        !slug || !extra.authorId || slug.toLowerCase() === extra.authorId.toLowerCase()
          ? extra.followers
          : undefined,
    }),
    publishedAt: toIso(node.datePublished) ?? toIso(node.uploadDate) ?? capturedAt,
    title: isVideo ? str(node.name) : undefined,
    text: truncate(body, 3000),
    format: isVideo ? 'video' : 'post',
    metrics: ldMetrics(node),
    capturedAt,
  });
}

/** "14.601 seguidores" or "11,969,466 followers" in the page text. */
export function followersInPage(html: string): number | undefined {
  const match = html.match(/([\d][\d.,\s]*\d|\d)\s*(seguidores|followers)/i);
  return match ? parseCount(match[1]) : undefined;
}

/** A company page (`linkedin.com/company/<slug>/`): its latest public posts with their counts. */
export const parseLinkedin: Parser = (body, record) => {
  const company = str(record.meta.company);
  const followers = followersInPage(body);
  const seen = new Set<string>();
  const items: RawItem[] = [];
  for (const node of ldPostings(body)) {
    const item = linkedinItem(node, record.capturedAt, {
      source: 'linkedin-company',
      authorId: company,
      followers,
    });
    if (!item || seen.has(item.externalId)) continue;
    seen.add(item.externalId);
    items.push(item);
  }
  return items;
};
