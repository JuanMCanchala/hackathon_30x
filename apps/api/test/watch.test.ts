import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { Fetcher } from '@radar/sources';
import type { Llm, RecordedRequest } from '../src/llm/cached';
import { JevUnavailableError, type JudgedPiece, type PieceJudge } from '../src/jev/client';
import {
  JEV_MAX_PIECES,
  adaptHit,
  createWatch,
  runWatch,
  watchDetail,
} from '../src/services/watch';
import { createApp } from '../src/http/app';
import { nonIsoDates, testContainer } from './helpers';

const NOW = '2026-10-17T18:00:00Z';
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3_600_000).toISOString();

const bsky = (id: string, lang: string, text: string, createdAt: string, likes: number) => ({
  uri: `at://did:plc:${id}/app.bsky.feed.post/${id}`,
  author: { did: `did:plc:${id}`, handle: `${id}.bsky.social`, displayName: id },
  record: { text, createdAt, langs: [lang] },
  likeCount: likes,
  replyCount: Math.round(likes / 10),
  repostCount: 0,
});

/** Bluesky answers with a fixed page per language; every other source finds nothing. */
const fetcher: Fetcher = async (url) => {
  if (!url.includes('bsky.app')) return { status: 404, url, body: '' };
  const posts = url.includes('lang=pt')
    ? [bsky('pt1', 'pt', 'Como a IA está mudando os negócios no Brasil', hoursAgo(5), 900)]
    : [
        bsky(
          'viral',
          'en',
          'How AI agents are changing small business this year',
          hoursAgo(6),
          5000,
        ),
        bsky('slow1', 'en', 'Notes on business software and the AI hype', hoursAgo(8), 10),
        bsky('slow2', 'en', 'A business lesson from my first startup', hoursAgo(9), 12),
        bsky('slow3', 'en', 'Why every business needs an AI policy', hoursAgo(10), 15),
        bsky('old', 'en', 'The business of AI, explained', hoursAgo(24 * 9), 8000),
        bsky('off', 'en', 'A new model for protein folding', hoursAgo(3), 7000),
        bsky('es1', 'es', 'Cómo la IA cambia los negocios', hoursAgo(4), 3000),
      ];
  return { status: 200, url, body: JSON.stringify({ posts }) };
};

const calls: string[] = [];

/** A scripted model: the plan, the translations and the adaptation, with fixed text. */
const llm: Llm = {
  async complete<T extends z.ZodType>(request: RecordedRequest<T>): Promise<z.infer<T>> {
    calls.push(request.name);
    const answer = (() => {
      if (request.name === 'watch-plan')
        return {
          en: { queries: ['AI business'], match: ['business'] },
          pt: { queries: ['negócios IA'], match: ['negócios'] },
        };
      if (request.name === 'watch-translate')
        return {
          items: [...request.user.matchAll(/^\[([^\]]+)\]/gm)].map((m) => ({
            id: m[1]!,
            es: `En español: ${m[1]}`,
          })),
        };
      if (request.name === 'watch-adapt')
        return {
          angle: 'Los agentes llegan a la pyme latinoamericana.',
          hooks: ['Uno', 'Dos', 'Tres'],
          linkedin: 'Post',
          carousel: [{ title: 'Lámina', body: 'Texto' }],
          reel: { hook: 'Gancho', beats: ['a'], onScreen: ['b'], cta: 'c' },
          youtube: { title: 'Título', thumbnail: 'Miniatura' },
          avoid: ['Nada'],
          inspiredBy: ['bluesky:viral'],
        };
      throw new Error(`unexpected ${request.name}`);
    })();
    return request.schema.parse(answer);
  },
};

describe('Vigía', () => {
  it('lets rules pick what spends tokens, and records why the rest stopped', async () => {
    const { deps } = await testContainer({ now: NOW });
    deps.llm = llm;
    const empty = mkdtempSync(join(tmpdir(), 'radar-watch-'));
    deps.config = { ...deps.config, RAW_DIR: empty, DATA_DIR: empty };

    const watch = await createWatch(deps, 'negocios');
    const report = await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });

    // Two Bluesky pages, one per language, with eight posts; the other sources find nothing.
    const steps = Object.fromEntries(report.steps.map((s) => [s.step, s.left]));
    expect(steps.encontradas).toBe(8);
    expect(steps.idioma).toBe(7);
    expect(steps.tema).toBe(6);
    expect(steps.reciente).toBe(5);
    expect(report.caught).toBeGreaterThanOrEqual(2);
    const stoppedBy = Object.fromEntries(report.rejected.map((r) => [r.rule, r.count]));
    expect(stoppedBy.idioma).toBe(1);
    expect(stoppedBy.tema).toBe(1);
    expect(stoppedBy.reciente).toBe(1);

    const detail = await watchDetail(deps, watch.id);
    const caught = detail.hits.map((h) => h.piece.id);
    expect(caught).toContain('bluesky:viral');
    expect(caught).toContain('bluesky:pt1');
    expect(caught).not.toContain('bluesky:off');
    expect(caught).not.toContain('bluesky:old');
    const viral = detail.hits.find((h) => h.piece.id === 'bluesky:viral')!;
    expect(viral.capture?.es).toBe('En español: bluesky:viral');
    expect(viral.reasons.join(' ')).toContain('Menciona «business»');
    // Only the caught pieces reached the model, in one translation call.
    expect(calls.filter((c) => c === 'watch-translate')).toHaveLength(1);

    // A second search catches nothing new: everything that passed is already caught.
    const again = await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });
    expect(again.caught).toBe(0);
    expect(again.rejected.find((r) => r.rule === 'nuevo')!.count).toBeGreaterThanOrEqual(2);

    const adaptation = await adaptHit(deps, watch.id, 'bluesky:viral');
    expect(adaptation.inspiredBy).toEqual(['bluesky:viral']);
    expect(
      (await watchDetail(deps, watch.id)).hits.find((h) => h.piece.id === 'bluesky:viral')!
        .adaptation?.angle,
    ).toContain('pyme');
  });

  it('with a YouTube key, reads exact dates in one videos.list call instead of opening pages', async () => {
    const { deps } = await testContainer({ now: NOW });
    deps.llm = llm;
    const empty = mkdtempSync(join(tmpdir(), 'radar-watch-'));
    deps.config = { ...deps.config, RAW_DIR: empty, DATA_DIR: empty, YOUTUBE_API_KEY: 'TEST' };
    // The search page rounds to «5 hours ago»; the API knows it is nine days old.
    const page = `<script>var ytInitialData = ${JSON.stringify({
      contents: [
        {
          videoRenderer: {
            videoId: 'yt-business',
            title: { runs: [{ text: 'How small business owners are using AI agents this year' }] },
            publishedTimeText: { simpleText: '5 hours ago' },
            viewCountText: { simpleText: '90,000 views' },
            ownerText: {
              runs: [
                { text: 'Canal', navigationEndpoint: { browseEndpoint: { browseId: 'UC1' } } },
              ],
            },
          },
        },
      ],
    })};</script>`;
    const answer = JSON.stringify({
      items: [
        {
          id: 'yt-business',
          snippet: {
            publishedAt: hoursAgo(24 * 9),
            channelId: 'UC1',
            title: 't',
            channelTitle: 'Canal',
          },
          statistics: { viewCount: '95000', likeCount: '4000', commentCount: '200' },
          contentDetails: { duration: 'PT9M' },
        },
      ],
    });
    const urls: string[] = [];
    const youtube: Fetcher = async (url, init) => {
      urls.push(url);
      if (url.includes('googleapis.com')) return { status: 200, url, body: answer };
      if (url.includes('youtube.com/results') && url.includes('hl=en'))
        return { status: 200, url, body: page };
      if (url.includes('youtube.com')) return { status: 404, url, body: '' };
      return fetcher(url, init);
    };

    const watch = await createWatch(deps, 'negocios');
    const report = await runWatch(deps, watch.id, { fetcher: youtube, pauseMs: 0 });

    const api = urls.filter((u) => u.includes('googleapis.com/youtube/v3/videos'));
    expect(api).toHaveLength(1);
    expect(new URL(api[0]!).searchParams.get('id')).toBe('yt-business');
    expect(urls.some((u) => u.includes('youtube.com/watch'))).toBe(false);
    expect(report.sources.find((s) => s.source === 'youtube-api')).toMatchObject({ found: 1 });
    const late = report.rejected.find((r) => r.rule === 'reciente')!;
    expect(late.examples.map((e) => e.reason).join(' ')).toContain('9 días');
  });
});

describe('Vigía with JEV', () => {
  async function setup(jev: PieceJudge | null) {
    const { deps } = await testContainer({ now: NOW });
    deps.llm = llm;
    deps.jev = jev;
    const empty = mkdtempSync(join(tmpdir(), 'radar-watch-'));
    deps.config = { ...deps.config, RAW_DIR: empty, DATA_DIR: empty };
    return { deps, watch: await createWatch(deps, 'negocios') };
  }

  /** A judge that answers from a table and remembers what it was asked. */
  const fakeJudge = (onTopic: Record<string, number>) => {
    const asked: JudgedPiece[] = [];
    const judge: PieceJudge = {
      async judge(_topic, pieces) {
        asked.push(...pieces);
        const verdicts = new Map(
          pieces.map((p) => [p.key, { onTopic: onTopic[p.key] ?? 0.9, fit: 7 }] as const),
        );
        return { verdicts, inputTokens: pieces.length * 470, ms: 5 };
      },
    };
    return { judge, asked };
  };

  it('asks JEV only for pieces that passed language and date, and lets it decide the topic', async () => {
    const { judge, asked } = fakeJudge({ 'bluesky:viral': 0.1, 'bluesky:off': 0.95 });
    const { deps, watch } = await setup(judge);
    const report = await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });

    // es1 (Spanish) and old (nine days) never reach JEV.
    expect(asked.map((p) => p.key).sort()).toEqual(
      [
        'bluesky:off',
        'bluesky:pt1',
        'bluesky:slow1',
        'bluesky:slow2',
        'bluesky:slow3',
        'bluesky:viral',
      ].sort(),
    );
    expect(report.jev).toMatchObject({ judged: 6, inputTokens: 6 * 470 });
    // JEV's cost is its own line; the reading cost stays the model's only.
    expect(report.costUsd).toBe(0);
    expect((report.jev as { costUsd: number }).costUsd).toBeCloseTo((6 * 470 * 0.042) / 1e6, 10);
    const hits = (await watchDetail(deps, watch.id)).hits;
    const caught = hits.map((h) => h.piece.id);
    expect(caught).toContain('bluesky:off');
    expect(caught).not.toContain('bluesky:viral');
    expect(hits.find((h) => h.piece.id === 'bluesky:off')!.reasons.join(' ')).toContain(
      'JEV: es del tema',
    );
  });

  it('serves every Vigía timestamp as ISO 8601, which every browser parses', async () => {
    const { deps, watch } = await setup(null);
    await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });
    const app = createApp(deps);
    const list = await (await app.request('/api/v1/watches')).json();
    const detail = await (await app.request(`/api/v1/watches/${watch.id}`)).json();
    expect((detail as { watch: { lastRunAt: string | null } }).watch.lastRunAt).not.toBeNull();
    expect(nonIsoDates(list)).toEqual([]);
    expect(nonIsoDates(detail)).toEqual([]);
  });

  it(`asks JEV about ${JEV_MAX_PIECES} pieces at most, the most engaged first`, async () => {
    const many: Fetcher = async (url) => {
      if (!url.includes('bsky.app') || url.includes('lang=pt'))
        return { status: 404, url, body: '' };
      const posts = Array.from({ length: JEV_MAX_PIECES + 30 }, (_, i) =>
        bsky(`p${i}`, 'en', `Business idea number ${i} with AI`, hoursAgo(2), i + 1),
      );
      return { status: 200, url, body: JSON.stringify({ posts }) };
    };
    const { judge, asked } = fakeJudge({});
    const { deps, watch } = await setup(judge);
    await runWatch(deps, watch.id, { fetcher: many, pauseMs: 0 });
    expect(asked).toHaveLength(JEV_MAX_PIECES);
    expect(asked.map((p) => p.key)).not.toContain('bluesky:p0');
  });

  it('does not spend JEV on pieces already caught or without any interaction', async () => {
    const quiet: Fetcher = async (url, ...rest) => {
      const res = await fetcher(url, ...rest);
      if (!url.includes('bsky.app') || url.includes('lang=pt')) return res;
      const body = JSON.parse(res.body) as { posts: unknown[] };
      body.posts.push(bsky('zero', 'en', 'A business idea nobody liked yet', hoursAgo(1), 0));
      return { ...res, body: JSON.stringify(body) };
    };
    const { judge, asked } = fakeJudge({});
    const { deps, watch } = await setup(judge);
    await runWatch(deps, watch.id, { fetcher: quiet, pauseMs: 0 });
    expect(asked.map((p) => p.key)).not.toContain('bluesky:zero');
    const caughtFirst = (await watchDetail(deps, watch.id)).hits.map((h) => h.piece.id);
    asked.length = 0;
    await runWatch(deps, watch.id, { fetcher: quiet, pauseMs: 0 });
    for (const key of caughtFirst) expect(asked.map((p) => p.key)).not.toContain(key);
  });

  it('keeps running on keywords when JEV is unavailable', async () => {
    const down: PieceJudge = {
      async judge() {
        throw new JevUnavailableError('JEV no respondió: 503');
      },
    };
    const { deps, watch } = await setup(down);
    const report = await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });
    expect(report.jev).toEqual({ skipped: 'JEV no respondió: 503' });
    const caught = (await watchDetail(deps, watch.id)).hits.map((h) => h.piece.id);
    expect(caught).toContain('bluesky:viral');
    expect(caught).not.toContain('bluesky:off');
  });

  it('without a key the run never calls JEV', async () => {
    const { deps, watch } = await setup(null);
    const report = await runWatch(deps, watch.id, { fetcher, pauseMs: 0 });
    expect(report.jev).toEqual({ skipped: 'sin llave' });
  });
});
