/** Bluesky post search (`app.bsky.feed.searchPosts` on api.bsky.app), top and latest. */
import type { Format, RawItem } from '@radar/core';
import type { Parser } from '../types';
import { compact, langOf, num, str, toIso } from '../util';

export interface BlueskyPost {
  uri?: string;
  author?: { did?: string; handle?: string; displayName?: string; followersCount?: number };
  record?: {
    text?: string;
    createdAt?: string;
    langs?: string[];
    embed?: { $type?: string; external?: { title?: string; description?: string } };
  };
  embed?: { $type?: string; external?: { title?: string; description?: string } };
  likeCount?: number;
  repostCount?: number;
  quoteCount?: number;
  replyCount?: number;
  bookmarkCount?: number;
  indexedAt?: string;
}

function formatOf(post: BlueskyPost): Format {
  const type = post.record?.embed?.$type ?? post.embed?.$type ?? '';
  if (type.includes('video')) return 'video';
  if (type.includes('images')) return 'image';
  return 'post';
}

/** One post as a piece. Shared with the sensor, which reads single posts from a thread. */
export function blueskyItem(
  post: BlueskyPost,
  capturedAt: string,
  query?: string,
): RawItem | undefined {
  const uri = post.uri ?? '';
  const rkey = uri.split('/').pop();
  const handle = post.author?.handle;
  if (!rkey || !handle) return undefined;
  const external = post.record?.embed?.external ?? post.embed?.external;
  const body = [post.record?.text, external?.title, external?.description]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join('\n');
  const shares =
    post.repostCount === undefined && post.quoteCount === undefined
      ? undefined
      : (num(post.repostCount) ?? 0) + (num(post.quoteCount) ?? 0);
  return compact<RawItem>({
    platform: 'bluesky',
    source: 'bluesky-search',
    externalId: rkey,
    url: `https://bsky.app/profile/${handle}/post/${rkey}`,
    author: compact({
      id: post.author?.did ?? handle,
      name: str(post.author?.displayName) ?? handle,
      handle,
      url: `https://bsky.app/profile/${handle}`,
      followers: num(post.author?.followersCount),
    }),
    publishedAt: toIso(post.record?.createdAt) ?? toIso(post.indexedAt) ?? capturedAt,
    text: body,
    format: formatOf(post),
    lang: langOf(post.record?.langs?.[0]),
    metrics: compact({
      likes: num(post.likeCount),
      comments: num(post.replyCount),
      shares,
      saves: num(post.bookmarkCount),
    }),
    capturedAt,
    query,
  });
}

export const parseBluesky: Parser = (body, record) => {
  let data: { posts?: BlueskyPost[] };
  try {
    data = JSON.parse(body);
  } catch {
    return [];
  }
  const query = str(record.meta.query);
  return (data.posts ?? [])
    .map((post) => blueskyItem(post, record.capturedAt, query))
    .filter((item): item is RawItem => item !== undefined);
};
