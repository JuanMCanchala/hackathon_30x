import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { RawItem } from '@radar/core';
import { items, watches } from '../src/db/schema';
import { createApp } from '../src/http/app';
import { saveItems } from '../src/pipeline/ingest';
import { exportSnapshot, importSnapshotIfEmpty } from '../src/services/snapshot';
import { testContainer } from './helpers';

const piece = (n: number): RawItem => ({
  platform: 'bluesky',
  source: 'bluesky-search',
  externalId: `p${n}`,
  url: `https://bsky.app/profile/a/post/p${n}`,
  author: { id: `a${n}`, name: `Autor ${n}`, handle: `a${n}` },
  publishedAt: '2026-10-16T12:00:00.000Z',
  // Line breaks and characters beyond ASCII must survive the line-by-line read.
  text: `Pieza ${n}
IA en español 🤖   fin`,
  format: 'post',
  lang: 'es',
  metrics: { likes: n },
  capturedAt: '2026-10-17T12:00:00.000Z',
});

/** A small exported week: 1,200 pieces (more than one insert batch) and a followed topic. */
async function snapshotDir() {
  const { deps } = await testContainer();
  deps.config = { ...deps.config, SNAPSHOT_DIR: mkdtempSync(join(tmpdir(), 'radar-snap-')) };
  await saveItems(
    deps,
    Array.from({ length: 1200 }, (_, n) => piece(n)),
  );
  await deps.db.insert(watches).values({
    id: 'wch_demo',
    term: 'negocios',
    plan: {},
    langs: ['en', 'pt'],
    windowHours: 72,
    everyMinutes: 60,
    budget: 12,
    active: true,
    createdAt: '2026-10-17T18:00:00Z',
    lastRunAt: null,
  });
  await exportSnapshot(deps);
  return deps.config.SNAPSHOT_DIR;
}

const count = async (
  deps: Awaited<ReturnType<typeof testContainer>>['deps'],
  table: typeof items | typeof watches,
) => (await deps.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]!.n;

describe('startup', () => {
  it('answers the health check while the demo week loads, and the rest once it is in', async () => {
    const { deps } = await testContainer();
    let finish!: () => void;
    const importing = new Promise<void>((resolve) => (finish = resolve));
    const app = createApp(deps, { ready: importing });

    const health = await app.request('/api/v1/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true, loading: true });
    const early = await app.request('/api/v1/radar');
    expect(early.status).toBe(503);
    expect(((await early.json()) as { error: { code: string } }).error.code).toBe('loading');

    finish();
    await importing;
    expect(await (await app.request('/api/v1/health')).json()).toEqual({
      ok: true,
      loading: false,
    });
    expect((await app.request('/api/v1/radar')).status).toBe(200);
  });

  it('finishes a snapshot import that a restart cut short, and loads it only once', async () => {
    const dir = await snapshotDir();
    const { deps } = await testContainer();
    deps.config = { ...deps.config, SNAPSHOT_DIR: dir };
    // A redeploy stopped the first boot after some pieces: the database is not empty, nor whole.
    await saveItems(deps, [piece(0)]);
    expect(await importSnapshotIfEmpty(deps)).toBeGreaterThan(1200);
    expect(await count(deps, items)).toBe(1200);
    expect(await count(deps, watches)).toBe(1);
    const [first] = await deps.db
      .select({ text: items.text })
      .from(items)
      .where(sql`${items.id} = 'bluesky:p7'`);
    expect(first?.text).toBe(piece(7).text);
    expect(await importSnapshotIfEmpty(deps)).toBe(0);
  });
});
