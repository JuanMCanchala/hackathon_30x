/**
 * The demo week end to end, the way the deploy runs it: a snapshot loaded into an empty database,
 * then the pages the jury opens. Catches analyses keyed to another day, a week that moves when
 * Vigía or the sensor save pieces, and timestamps a browser cannot read.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { analyses } from '../src/db/schema';
import { createApp } from '../src/http/app';
import type { Llm, RecordedRequest } from '../src/llm/cached';
import { saveItems } from '../src/pipeline/ingest';
import { radar } from '../src/services/radar';
import { exportSnapshot, importSnapshotIfEmpty } from '../src/services/snapshot';
import { topicDetail } from '../src/services/topic';
import { nonIsoDates, testContainer } from './helpers';
import { post, scriptedLlm, seeded } from './week';

/** Exports the shared week as the demo does, with its analyses dated a day before its end. */
async function snapshotFixture() {
  const deps = await seeded();
  deps.config = { ...deps.config, SNAPSHOT_DIR: mkdtempSync(join(tmpdir(), 'radar-smoke-')) };
  const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
  for (const t of week.topics) await topicDetail(deps, t.id);
  const [stored] = await deps.db.select({ week: analyses.week }).from(analyses);
  const dayBefore = new Date(Date.parse(stored!.week) - 86_400_000).toISOString().slice(0, 10);
  await deps.db.update(analyses).set({ week: dayBefore });
  await exportSnapshot(deps);
  return deps.config.SNAPSHOT_DIR;
}

/** The scripted model, minus the analyses: those must come from the snapshot. */
function noAnalysesLlm(): Llm {
  const scripted = scriptedLlm();
  return {
    complete<T extends z.ZodType>(request: RecordedRequest<T>): Promise<z.infer<T>> {
      if (request.name === 'why' || request.name === 'fit')
        return Promise.reject(new Error(`Petición inesperada al modelo: ${request.name}`));
      return scripted.complete(request);
    },
  };
}

const json = async (res: Response) => {
  expect(res.status, res.url).toBe(200);
  return res.json() as Promise<unknown>;
};

describe('the demo week, end to end', () => {
  it('loads, explains every topic, holds its week and serves dates every browser reads', async () => {
    const dir = await snapshotFixture();
    const { deps } = await testContainer();
    deps.config = { ...deps.config, SNAPSHOT_DIR: dir, DEMO_MODE: true };
    deps.llm = noAnalysesLlm();
    expect(await importSnapshotIfEmpty(deps)).toBeGreaterThan(0);
    const app = createApp(deps);

    // 1. The radar returns topics.
    type Week = { week: { start: string; end: string }; topics: { id: string }[] };
    const before = (await json(await app.request('/api/v1/radar?audience=all'))) as Week;
    expect(before.topics.length).toBeGreaterThan(0);

    // 2. Each topic page has its narrative and fit, read from the snapshot.
    const pages: unknown[] = [];
    for (const t of before.topics) {
      const page = (await json(await app.request(`/api/v1/topics/${t.id}`))) as {
        why: { narrative: string | null };
        fit: { score: number } | null;
      };
      expect(page.why.narrative, t.id).toBeTruthy();
      expect(page.fit?.score, t.id).toBeGreaterThan(0);
      pages.push(page);
    }

    // 3. A sensor submission and a Vigía find, read later, leave the week where it was.
    const later = new Date(Date.parse(before.week.end) + 2 * 86_400_000).toISOString();
    await saveItems(
      deps,
      [{ ...post('fan1', 'fan', 'Sora 2 en mi feed', 0, 5), capturedAt: later }],
      true,
    );
    await saveItems(deps, [
      { ...post('v1', 'someone', 'Sora 2 is wild', 0, 50), query: 'vigia:sora', capturedAt: later },
    ]);
    const after = (await json(await app.request('/api/v1/radar?audience=all'))) as Week;
    expect(after.week).toEqual(before.week);
    expect(after.topics.map((t) => t.id)).toEqual(before.topics.map((t) => t.id));

    // 4. Every timestamp in what the pages read is ISO 8601.
    const reads = [
      before,
      ...pages,
      await json(await app.request('/api/v1/calendar')),
      await json(await app.request('/api/v1/sensor')),
      await json(await app.request('/api/v1/watches')),
    ];
    expect(reads.flatMap((r) => nonIsoDates(r))).toEqual([]);
    for (const r of reads)
      for (const value of JSON.stringify(r).match(
        /\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})/g,
      ) ?? [])
        expect(Number.isNaN(Date.parse(value)), value).toBe(false);
  });
});
