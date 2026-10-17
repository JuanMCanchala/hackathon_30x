import { describe, expect, it } from 'vitest';
import { ApifyError, harvestItem, linkedinPostSearch, linkedinSearchCost } from '../src/apify';
import { fakeFetcher } from './helpers';

/** The example post in the actor's README. */
const README_POST = {
  type: 'post',
  id: '7330988768578920448',
  linkedinUrl:
    'https://www.linkedin.com/posts/nickbennett05_hiring-activity-7330988768578920448-Je01',
  content: 'I’m #hiring. Are you passionate about AI-powered systems and agent-based workflows?',
  author: {
    universalName: null,
    publicIdentifier: 'nickbennett05',
    type: 'profile',
    name: 'Nick Bennett',
    linkedinUrl:
      'https://www.linkedin.com/in/nickbennett05?miniProfileUrn=urn%3Ali%3Afsd_profile%3AACoAAAM',
    info: 'UX Leadership at Amazon',
  },
  postedAt: { timestamp: 1747843925614, date: '2025-05-21T16:12:05.614Z' },
  postImages: [],
  engagement: { likes: 13, comments: 1, shares: 9 },
};

describe('harvestItem', () => {
  it('maps the documented dataset item to a LinkedIn piece', () => {
    expect(harvestItem(README_POST, '2026-10-17T12:00:00.000Z', 'agentes de IA')).toEqual({
      platform: 'linkedin',
      source: 'linkedin-search',
      externalId: '7330988768578920448',
      url: 'https://www.linkedin.com/posts/nickbennett05_hiring-activity-7330988768578920448-Je01',
      author: {
        id: 'nickbennett05',
        name: 'Nick Bennett',
        handle: 'nickbennett05',
        url: 'https://www.linkedin.com/in/nickbennett05',
      },
      publishedAt: '2025-05-21T16:12:05.614Z',
      text: README_POST.content,
      format: 'post',
      metrics: { likes: 13, comments: 1, shares: 9 },
      capturedAt: '2026-10-17T12:00:00.000Z',
      query: 'agentes de IA',
    });
  });

  it('tells carousels, images and videos apart', () => {
    expect(harvestItem({ ...README_POST, document: {} }, 'x')?.format).toBe('carousel');
    expect(harvestItem({ ...README_POST, postImages: [{}, {}] }, 'x')?.format).toBe('carousel');
    expect(harvestItem({ ...README_POST, postImages: [{}] }, 'x')?.format).toBe('image');
    expect(harvestItem({ ...README_POST, postVideo: {} }, 'x')?.format).toBe('video');
  });
});

describe('linkedinPostSearch', () => {
  it('runs the actor synchronously with the documented input and prices the result', async () => {
    const fetcher = fakeFetcher([
      [/run-sync-get-dataset-items/, 201, JSON.stringify([README_POST, README_POST])],
    ]);
    const { items, costUsd } = await linkedinPostSearch({
      token: 'apify_api_SECRET',
      queries: ['agentes de IA'],
      maxPosts: 2,
      maxTotalChargeUsd: 0.5,
      fetcher,
      now: '2026-10-17T12:00:00.000Z',
    });
    const call = fetcher.calls[0]!;
    const url = new URL(call.url);
    expect(url.pathname).toBe(
      '/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items',
    );
    expect(url.searchParams.get('token')).toBe('apify_api_SECRET');
    expect(url.searchParams.get('maxTotalChargeUsd')).toBe('0.5');
    expect(call.init?.method).toBe('POST');
    expect(JSON.parse(call.init!.body!)).toMatchObject({
      searchQueries: ['agentes de IA'],
      maxPosts: 2,
      postedLimit: 'week',
      profileScraperMode: 'short',
      scrapeReactions: false,
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.query).toBe('agentes de IA');
    expect(costUsd).toBe(linkedinSearchCost(2));
    expect(linkedinSearchCost(1000)).toBeCloseTo(2.00005, 5);
  });

  it('reports Apify errors without the token', async () => {
    const fetcher = fakeFetcher([
      [
        /apify/,
        401,
        '{"error":{"type":"token-not-valid","message":"Authentication token is not valid."}}',
      ],
    ]);
    const run = linkedinPostSearch({ token: 'apify_api_SECRET', queries: ['IA'], fetcher });
    await expect(run).rejects.toBeInstanceOf(ApifyError);
    await expect(run).rejects.toThrow('Apify answered 401: Authentication token is not valid.');
    await run.catch((e: Error) => expect(e.message).not.toContain('SECRET'));
  });
});
