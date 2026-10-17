import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import type { RawItem } from '@radar/core';
import { dedupe, merge, parseRun } from '../src/parse';
import { latestRun, listRuns, readRun } from '../src/raw';
import { fixture } from './helpers';

const base: RawItem = {
  platform: 'github',
  source: 'github-search',
  externalId: 'acme/agent',
  url: 'https://github.com/acme/agent',
  author: { id: 'acme', name: 'acme' },
  publishedAt: '2026-10-12T08:00:00.000Z',
  title: 'acme/agent',
  text: 'acme/agent\nAn agent framework\nTemas: agents',
  format: 'repo',
  metrics: { likes: 100, shares: 10 },
  capturedAt: '2026-10-17T10:00:00.000Z',
  query: 'topic:ai-agents',
};

describe('merge and dedupe', () => {
  it('takes the newer counts but keeps the exact date and the query', () => {
    const trending: RawItem = {
      ...base,
      source: 'github-trending',
      publishedAt: '2026-10-17T12:00:00.000Z',
      publishedApprox: true,
      text: 'acme/agent\n+50 estrellas esta semana',
      metrics: { likes: 150 },
      capturedAt: '2026-10-17T12:00:00.000Z',
      query: undefined,
    };
    const merged = merge(base, trending);
    expect(merged).toMatchObject({
      source: 'github-trending',
      publishedAt: '2026-10-12T08:00:00.000Z',
      metrics: { likes: 150, shares: 10 },
      query: 'topic:ai-agents',
      text: base.text,
    });
    expect(merged.publishedApprox).toBeUndefined();
  });

  it('keeps a known author over an unknown one, whatever the order', () => {
    const short: RawItem = {
      ...base,
      platform: 'youtube',
      externalId: 'abc',
      author: { id: '', name: '' },
      capturedAt: '2026-10-17T12:00:00.000Z',
    };
    const video: RawItem = {
      ...short,
      author: { id: 'UC1', name: 'Canal' },
      capturedAt: '2026-10-17T11:00:00.000Z',
    };
    expect(merge(video, short).author).toEqual({ id: 'UC1', name: 'Canal' });
    expect(dedupe([short, video, short])).toHaveLength(1);
  });

  it('separates the same id on different platforms', () => {
    expect(dedupe([base, { ...base, platform: 'huggingface' }])).toHaveLength(2);
  });
});

describe('reading a capture run', () => {
  const root = mkdtempSync(join(tmpdir(), 'radar-raw-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const writeRun = (name: string) => {
    const dir = join(root, name);
    mkdirSync(join(dir, 'bluesky'), { recursive: true });
    mkdirSync(join(dir, 'hn'), { recursive: true });
    writeFileSync(join(dir, 'bluesky/a.json.gz'), gzipSync(fixture('bluesky-search.json')));
    writeFileSync(join(dir, 'bluesky/b.json.gz'), gzipSync(fixture('bluesky-search.json')));
    writeFileSync(join(dir, 'hn/s.json.gz'), gzipSync(fixture('hn-stories.json')));
    const lines = [
      { source: 'bluesky', key: 'a', file: 'bluesky/a.json.gz', meta: { query: 'IA' } },
      { source: 'bluesky', key: 'b', file: 'bluesky/b.json.gz', meta: { query: 'agentes' } },
      { source: 'hn', key: 's', file: 'hn/s.json.gz', meta: {} },
      { source: 'x', key: 'openai', file: null, status: 429, meta: {} },
    ].map((l) =>
      JSON.stringify({
        url: 'u',
        status: 200,
        bytes: 1,
        capturedAt: '2026-10-17T16:58:10.000Z',
        ...l,
      }),
    );
    writeFileSync(join(dir, 'index.jsonl'), `${lines.join('\n')}\n{"broken`);
    return dir;
  };
  const older = writeRun('2026-10-17T10-00');
  const newer = writeRun('2026-10-17T12-00');
  mkdirSync(join(root, 'not-a-run'));

  it('lists runs oldest first and finds the latest', async () => {
    expect(await listRuns(root)).toEqual([older, newer]);
    expect(await latestRun(root)).toBe(newer);
    expect(await listRuns(join(root, 'missing'))).toEqual([]);
  });

  it('yields only the answered requests, decompressed', async () => {
    const seen: string[] = [];
    for await (const { record, body } of readRun(newer)) {
      seen.push(record.key);
      expect(body.startsWith('{')).toBe(true);
    }
    expect(seen).toEqual(['a', 'b', 's']);
  });

  it('parses a run into pieces without repeats', async () => {
    const items = await parseRun(newer);
    // Two Bluesky posts captured twice, plus two HN stories.
    expect(items).toHaveLength(4);
    expect(items.filter((i) => i.platform === 'bluesky')).toHaveLength(2);
  });
});
