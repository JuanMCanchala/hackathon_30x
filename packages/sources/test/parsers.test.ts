import { describe, expect, it } from 'vitest';
import { parseRecord } from '../src/parse';
import { CAPTURED_AT, fixture, record } from './helpers';

const parse = (file: string, source: string, meta: Record<string, unknown> = {}, key = 'k') =>
  parseRecord(fixture(file), record(source, meta, key));

describe('youtube search', () => {
  const items = parse('youtube-search-es.html', 'youtube', { query: 'agentes de IA', lang: 'es' });

  it('reads regular results with channel, views, length and an approximate date', () => {
    const video = items.find((i) => i.externalId === '8O58m66BICU')!;
    expect(video).toMatchObject({
      platform: 'youtube',
      source: 'youtube-search',
      url: 'https://www.youtube.com/watch?v=8O58m66BICU',
      author: {
        id: 'UCxcDzs-4quJV4QsairlFYNg',
        name: 'Alejavi Rivera',
        handle: '@alejavirivera',
      },
      format: 'video',
      durationSec: 2124,
      metrics: { views: 46_429 },
      publishedApprox: true,
      query: 'agentes de IA',
      capturedAt: CAPTURED_AT,
    });
    // "hace 1 día", counted back from the capture.
    expect(video.publishedAt).toBe('2026-10-16T16:58:10.000Z');
  });

  it('keeps shorts, without a channel and dated at the capture', () => {
    const shorts = items.filter((i) => i.format === 'short');
    expect(shorts.map((s) => s.externalId)).toEqual(['m0Vt-HnBIgo', 'aUMCURD30S0']);
    expect(shorts[0]).toMatchObject({
      url: 'https://www.youtube.com/shorts/m0Vt-HnBIgo',
      author: { id: '' },
      metrics: { views: 42 },
      publishedAt: CAPTURED_AT,
      publishedApprox: true,
    });
  });

  it('reads the English page too ("4d ago", "165,673 views")', () => {
    const [video] = parse('youtube-search-en.html', 'youtube', { query: 'AI agents' });
    expect(video).toMatchObject({
      externalId: 'HdI_aYzgJIg',
      metrics: { views: 165_673 },
      publishedAt: '2026-10-13T16:58:10.000Z',
      durationSec: 921,
    });
  });

  it('gives nothing for a page without ytInitialData', () => {
    expect(parseRecord('<html></html>', record('youtube'))).toEqual([]);
  });
});

describe('bluesky search', () => {
  it('reads text, engagement, language and the post URL', () => {
    const items = parse('bluesky-search.json', 'bluesky', { query: 'agentes de IA' });
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      platform: 'bluesky',
      externalId: '3mxypoocwm22m',
      url: 'https://bsky.app/profile/cuenta2.bsky.social/post/3mxypoocwm22m',
      author: { id: 'did:plc:ejemplo2', handle: 'cuenta2.bsky.social' },
      publishedAt: '2026-10-16T13:47:54.728Z',
      format: 'image',
      lang: 'es',
      // shares = reposts + quotes
      metrics: { likes: 5, comments: 2, shares: 1, saves: 1 },
      query: 'agentes de IA',
    });
  });
});

describe('feeds', () => {
  it('Google News: strips " - Source" from the headline and keeps the source as author', () => {
    const [first] = parse('google-news.xml', 'news', { query: 'agentes de IA', lang: 'es' });
    expect(first).toMatchObject({
      platform: 'news',
      format: 'news',
      lang: 'es',
      author: { name: 'DW.com', url: 'https://www.dw.com' },
      publishedAt: '2026-10-12T18:46:58.000Z',
    });
    expect(first!.title).toBe(
      'Hackeos, denuncias falsas y alertas: los 9 episodios en que la IA parecía escapar al control humano',
    );
  });

  it('newsletters: one item per issue, the publication as author', () => {
    const items = parse('rundown.xml', 'newsletters', { feed: 'https://www.therundown.ai/feed' });
    expect(items.map((i) => i.title)).toEqual([
      'Rogue AI agents sit for their first interview',
      'OpenAI finds a bug in its boardroom',
    ]);
    expect(items[0]).toMatchObject({
      platform: 'newsletter',
      format: 'article',
      lang: 'en',
      author: { name: 'The Rundown AI' },
    });
    expect(items[0]!.text).toContain('Build a live sales dashboard in Claude');
  });

  it('Product Hunt (Atom): launches, without the "Discussion | Link" tail', () => {
    const [launch] = parse('producthunt.xml', 'newsletters', {
      feed: 'https://www.producthunt.com/feed?category=artificial-intelligence',
    });
    expect(launch).toMatchObject({
      platform: 'producthunt',
      format: 'launch',
      title: 'NitroStack',
      url: 'https://www.producthunt.com/products/nitrostack',
      publishedAt: '2026-10-08T15:53:30.000Z',
    });
    expect(launch!.text).toBe('NitroStack\nBuild, test, and deploy MCP servers in one place');
  });
});

describe('technical lane', () => {
  it('Hacker News: points as likes, the linked page as URL', () => {
    const [story] = parse('hn-stories.json', 'hn');
    expect(story).toMatchObject({
      platform: 'hn',
      externalId: '50122800',
      title: 'Claude reveals ECDSA curve origins',
      url: 'https://www.anthropic.com/research/ecdsa-curve-origins',
      metrics: { likes: 977, comments: 355 },
      publishedAt: '2026-10-16T18:55:59.000Z',
    });
  });

  it('GitHub search: stars as likes, forks as shares, the owner as author', () => {
    const [repo] = parse('github-search.json', 'github', { query: 'topic:ai-agents' }, 'agents');
    expect(repo).toMatchObject({
      platform: 'github',
      source: 'github-search',
      externalId: 'morluto/rea',
      format: 'repo',
      author: { id: 'morluto' },
      metrics: { likes: 303_382, shares: 76_787 },
      publishedAt: '2026-04-14T00:51:32.000Z',
    });
  });

  it('GitHub trending: total stars as likes and the week in the text', () => {
    const items = parse('github-trending.html', 'github', {}, 'trending-weekly');
    expect(items.map((i) => i.externalId)).toEqual(['morluto/rea', 'storytold/artcraft']);
    expect(items[1]).toMatchObject({
      source: 'github-trending',
      metrics: { likes: 31_485, shares: 4_984 },
      publishedApprox: true,
    });
    expect(items[1]!.text).toMatch(/\+20267 estrellas esta semana$/);
  });

  it('Hugging Face: models, spaces and papers', () => {
    const [model] = parse('huggingface-models.json', 'huggingface', {}, 'models');
    expect(model).toMatchObject({
      externalId: 'model:google/embeddinggemma-2',
      format: 'model',
      metrics: { likes: 2573, views: 158_490 },
    });
    expect(model!.text).not.toContain('license:');
    const [space] = parse('huggingface-spaces.json', 'huggingface', {}, 'spaces');
    expect(space!.url).toBe(
      'https://huggingface.co/spaces/Pepe104/MiniMax-H3-Turbo-Lora-UNCENSORED',
    );
    const [paper] = parse('huggingface-papers.json', 'huggingface', {}, 'papers');
    expect(paper).toMatchObject({
      externalId: 'paper:2610.21185',
      format: 'paper',
      metrics: { likes: 5, comments: 1 },
    });
  });

  it('arXiv: papers without the version in the id', () => {
    const items = parse('arxiv.xml', 'arxiv', { category: 'cs.AI' });
    expect(items[0]).toMatchObject({
      platform: 'arxiv',
      externalId: '2610.22372',
      format: 'paper',
      author: { name: 'Zhixu Li' },
      query: 'cs.AI',
    });
  });
});

describe('accounts we follow', () => {
  it('X: own tweets with their counts, retweets left out', () => {
    // Synthetic fixture with the embed page's shape: X answered 429 while this was built.
    const items = parse('x-timeline.html', 'x', { handle: 'EjemploIA' });
    expect(items.map((i) => i.externalId)).toEqual(['1978000000000000001', '1978000000000000002']);
    expect(items[0]).toMatchObject({
      platform: 'x',
      url: 'https://x.com/EjemploIA/status/1978000000000000001',
      author: { id: 'ejemploia', followers: 250_000 },
      publishedAt: '2026-10-16T17:00:00.000Z',
      format: 'image',
      // shares = retweets + quotes
      metrics: { likes: 5120, comments: 340, shares: 700, saves: 800 },
    });
    expect(items[0]!.text).toBe(
      'Presentamos agentes que trabajan contigo en tus hojas de cálculo.',
    );
    expect(items[1]!.format).toBe('video');
  });

  it('Instagram: reels with views, carousels, and collab posts under their real owner', () => {
    const items = parse('instagram-profile.json', 'instagram', { username: 'andresbilbao' });
    expect(items).toHaveLength(3);
    const reel = items.find((i) => i.externalId === 'DdhqaUlDFlt')!;
    expect(reel).toMatchObject({
      platform: 'instagram',
      url: 'https://www.instagram.com/reel/DdhqaUlDFlt/',
      author: { id: 'andresbilbao', followers: 1_020_950 },
      format: 'reel',
      metrics: { views: 8932, likes: 241, comments: 145 },
      publishedAt: '2026-09-20T22:31:05.000Z',
    });
    const collab = items.find((i) => i.externalId === 'DdXXxMFGhyb')!;
    expect(collab.format).toBe('carousel');
    expect(collab.author.id).toBe('crece30x');
    expect(collab.author.followers).toBeUndefined();
  });

  it('LinkedIn company page: posts with reactions and the page followers', () => {
    const items = parse('linkedin-company.html', 'linkedin', { company: 'crece30x' });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      platform: 'linkedin',
      source: 'linkedin-company',
      externalId: '7494082622122356737',
      url: 'https://www.linkedin.com/posts/crece30x_viernes-14-ctf-activity-7494082622122356737-CDze',
      author: { id: 'crece30x', name: '30X', followers: 14_601 },
      metrics: { likes: 18 },
      publishedAt: '2026-08-14T17:28:50.405Z',
      format: 'post',
    });
  });
});

describe('parseRecord', () => {
  it('ignores unknown groups and broken bodies', () => {
    expect(parseRecord('{}', record('tiktok-trends'))).toEqual([]);
    expect(parseRecord('not json', record('bluesky'))).toEqual([]);
    expect(parseRecord('<rss>', record('news'))).toEqual([]);
  });
});
