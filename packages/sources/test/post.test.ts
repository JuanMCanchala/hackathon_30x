import { describe, expect, it } from 'vitest';
import { readPublicPost, tweetToken } from '../src/post';
import { fakeFetcher, fixture } from './helpers';

const NOW = '2026-10-17T18:00:00.000Z';

describe('readPublicPost', () => {
  it('LinkedIn post: JSON-LD counts, with the page attributes as backup', async () => {
    const fetcher = fakeFetcher([[/linkedin\.com\/posts\//, 200, fixture('linkedin-post.html')]]);
    const item = await readPublicPost(
      'https://www.linkedin.com/posts/crece30x_viernes-14-ctf-activity-7494082622122356737-CDze?utm_source=share',
      { fetcher, now: NOW },
    );
    expect(item).toMatchObject({
      platform: 'linkedin',
      source: 'sensor',
      externalId: '7494082622122356737',
      author: { name: '30X' },
      metrics: { likes: 18, comments: 1 },
      publishedAt: '2026-08-14T17:28:50.405Z',
      capturedAt: NOW,
    });
    expect(item!.text).toContain('Colombia Tech Fest');
  });

  it('YouTube video: views, likes, channel and date from the watch page', async () => {
    const fetcher = fakeFetcher([
      [/youtube\.com\/watch\?v=HbMuYv8H0vo/, 200, fixture('youtube-watch.html')],
    ]);
    const item = await readPublicPost('https://youtu.be/HbMuYv8H0vo', { fetcher, now: NOW });
    expect(item).toMatchObject({
      platform: 'youtube',
      externalId: 'HbMuYv8H0vo',
      url: 'https://www.youtube.com/watch?v=HbMuYv8H0vo',
      author: { id: 'UCl5-lvQyfILb-l2abPk4Ntg' },
      format: 'video',
      metrics: { likes: 2720 },
    });
    expect(item!.metrics.views).toBeGreaterThan(100_000);
    expect(item!.publishedApprox).toBeUndefined();
  });

  it('TikTok video: the exact counts from statsV2', async () => {
    const fetcher = fakeFetcher([
      [/tiktok\.com\/@scout2015\/video\//, 200, fixture('tiktok-video.html')],
    ]);
    const item = await readPublicPost(
      'https://www.tiktok.com/@scout2015/video/6718335390845095173',
      {
        fetcher,
        now: NOW,
      },
    );
    expect(item).toMatchObject({
      platform: 'tiktok',
      externalId: '6718335390845095173',
      author: { id: 'scout2015', followers: 9_000_000 },
      format: 'short',
      metrics: { views: 159_500, likes: 35_200, comments: 5484, shares: 1515, saves: 648 },
      publishedAt: '2019-07-27T13:32:38.000Z',
    });
  });

  it('X post: through the embed endpoint with its token', async () => {
    const fetcher = fakeFetcher([
      [/cdn\.syndication\.twimg\.com\/tweet-result\?id=20&/, 200, fixture('x-tweet-result.json')],
    ]);
    const item = await readPublicPost('https://x.com/jack/status/20', { fetcher, now: NOW });
    expect(fetcher.calls[0]!.url).toContain(`token=${tweetToken('20')}`);
    expect(item).toMatchObject({
      platform: 'x',
      externalId: '20',
      text: 'just setting up my twttr',
      author: { id: 'jack' },
      metrics: { likes: 309_267, comments: 18_092 },
    });
  });

  it('Bluesky post: resolves the handle, then reads the thread', async () => {
    const fetcher = fakeFetcher([
      [/resolveHandle\?handle=cuenta3\.bsky\.social/, 200, '{"did":"did:plc:ejemplo3"}'],
      [/getPostThread\?uri=at%3A%2F%2Fdid%3Aplc%3Aejemplo3/, 200, fixture('bluesky-thread.json')],
    ]);
    const item = await readPublicPost(
      'https://bsky.app/profile/cuenta3.bsky.social/post/3my3a33s3es2n',
      {
        fetcher,
        now: NOW,
      },
    );
    expect(item).toMatchObject({
      platform: 'bluesky',
      source: 'sensor',
      externalId: '3my3a33s3es2n',
      author: { handle: 'cuenta3.bsky.social' },
      lang: 'es',
    });
    expect(item!.metrics.likes).toBeGreaterThan(0);
  });

  it('Instagram reel: likes, comments, author and date from the preview tags', async () => {
    const fetcher = fakeFetcher([
      [/instagram\.com\/reel\/DdhqaUlDFlt\//, 200, fixture('instagram-post.html')],
    ]);
    const item = await readPublicPost('https://www.instagram.com/reel/DdhqaUlDFlt/?igsh=abc', {
      fetcher,
      now: NOW,
    });
    expect(fetcher.calls[0]!.init?.headers?.['user-agent']).toMatch(/facebookexternalhit/);
    expect(item).toMatchObject({
      platform: 'instagram',
      externalId: 'DdhqaUlDFlt',
      author: { id: 'andresbilbao' },
      format: 'reel',
      metrics: { likes: 241, comments: 145 },
      text: 'Comenta "30X" si no quieres quedarte sin cupo',
    });
    expect(item!.publishedAt.slice(0, 10)).toMatch(/^2026-09-2[01]$/);
  });

  it('gives null for unsupported sites, broken links and pages that do not answer', async () => {
    const fetcher = fakeFetcher([[/linkedin/, 404, '']]);
    expect(await readPublicPost('https://example.com/post/1', { fetcher })).toBeNull();
    expect(await readPublicPost('no es un enlace', { fetcher })).toBeNull();
    expect(
      await readPublicPost('https://www.linkedin.com/posts/x-activity-123456789012', { fetcher }),
    ).toBeNull();
    expect(await readPublicPost('https://x.com/jack', { fetcher })).toBeNull();
  });
});
