import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { analyses } from '../src/db/schema';
import { createApp } from '../src/http/app';
import { approve, adaptTopic, calendar } from '../src/services/adapt';
import { saveItems } from '../src/pipeline/ingest';
import { radar } from '../src/services/radar';
import { watchSchedulerEnabled } from '../src/services/watch';
import { loadConfig } from '../src/config';
import { topicDetail } from '../src/services/topic';
import { nonIsoDates } from './helpers';
import { post, seeded } from './week';

describe('the radar, from pieces to the calendar', () => {
  it('ranks the topic that took off above the one that stays flat', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const [first] = week.topics;
    expect(first?.name).toBe('Sora 2');
    expect(first?.growthPct).toBeGreaterThan(100);
    expect(['emergente', 'crecimiento']).toContain(first?.stage);
    const excel = week.topics.find((t) => t.name === 'Excel con IA');
    expect(excel === undefined || excel.momentum < first!.momentum).toBe(true);
    expect(week.basis.creators).toBeGreaterThan(10);
  });

  it('explains the topic, adapts it and puts an approved piece on the calendar', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const id = week.topics[0]!.id;
    const detail = await topicDetail(deps, id);
    expect(detail.topic.why).toContain('Sora 2');
    expect(detail.fit?.score).toBe(8);
    expect(detail.evidence.length).toBeGreaterThan(0);
    const adaptation = await adaptTopic(deps, id);
    const entry = await approve(deps, {
      adaptationId: adaptation.id,
      format: 'linkedin',
      scheduledFor: '2026-10-20',
      approvedBy: 'Equipo de medios 30X',
    });
    expect(entry.format).toBe('Post de LinkedIn');
    expect((await calendar(deps)).map((e) => e.topicName)).toEqual(['Sora 2']);
  });

  it('serves the week over HTTP', async () => {
    const deps = await seeded();
    const res = await createApp(deps).request('/api/v1/radar?platform=all&audience=all');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { topics: { name: string }[] };
    expect(body.topics[0]?.name).toBe('Sora 2');
  });

  it('reads the latest stored analysis when the week moved, without calling the model', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const id = week.topics[0]!.id;
    await topicDetail(deps, id);
    // The snapshot's analyses are dated a day before its asOf: the exact week has none.
    const [stored] = await deps.db.select({ week: analyses.week }).from(analyses);
    const dayBefore = new Date(Date.parse(stored!.week) - 86_400_000).toISOString().slice(0, 10);
    await deps.db.update(analyses).set({ week: dayBefore });
    deps.llm = {
      complete: () => Promise.reject(new Error('Petición inesperada al modelo')),
    };
    const res = await createApp(deps).request(`/api/v1/topics/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      why: { narrative: string | null };
      fit: { score: number } | null;
    };
    expect(body.why.narrative).toBe('Abren con una cifra.');
    expect(body.fit?.score).toBe(8);
  });

  it('writes a new analysis once the stored one is a week or more away', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const id = week.topics[0]!.id;
    await topicDetail(deps, id);
    await deps.db.update(analyses).set({ week: '2026-09-01' });
    const detail = await topicDetail(deps, id);
    expect(detail.why.narrative).toBe('Abren con una cifra.');
    const weeks = await deps.db.select({ week: analyses.week }).from(analyses);
    expect(weeks.some((w) => w.week !== '2026-09-01')).toBe(true);
  });

  it('keeps the week and its topics when Vigía and the sensor save pieces later', async () => {
    const deps = await seeded();
    const filters = { platform: 'all', region: 'global', untouched: false } as const;
    const before = await radar(deps, filters);
    const later = '2026-10-19T12:00:00Z';
    const seen = post('n0', 'creator0', 'Sora 2 genera 3 videos en 1 minuto (0)', 1, 900);
    const found = post('v1', 'someone', 'Sora 2 is wild', 0, 50);
    await saveItems(deps, [
      { ...seen, query: 'vigia:sora', capturedAt: later },
      { ...found, query: 'vigia:sora', capturedAt: later },
    ]);
    await saveItems(
      deps,
      [{ ...post('x1', 'fan', 'Sora 2 en mi feed', 0, 5), capturedAt: later }],
      true,
    );
    await saveItems(deps, [{ ...seen, capturedAt: later }], true);
    const after = await radar(deps, filters);
    expect(after.week).toEqual(before.week);
    expect(after.topics.map((t) => t.id)).toEqual(before.topics.map((t) => t.id));
  });

  it('starts the watch scheduler outside the demo, or when asked for', () => {
    const config = (env: Record<string, string>) => loadConfig({ ...env });
    expect(watchSchedulerEnabled(config({ DEMO_MODE: 'true' }))).toBe(false);
    expect(watchSchedulerEnabled(config({ DEMO_MODE: 'true', WATCH_SCHEDULER: 'true' }))).toBe(
      true,
    );
    expect(watchSchedulerEnabled(config({ DEMO_MODE: 'false' }))).toBe(true);
    expect(watchSchedulerEnabled(config({ DEMO_MODE: 'false', WATCH_SCHEDULER: 'false' }))).toBe(
      false,
    );
  });

  it('serves every timestamp as ISO 8601 across the read routes', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const id = week.topics[0]!.id;
    const adaptation = await adaptTopic(deps, id);
    await approve(deps, {
      adaptationId: adaptation.id,
      format: 'linkedin',
      scheduledFor: '2026-10-20',
      approvedBy: 'Equipo de medios 30X',
    });
    const app = createApp(deps);
    for (const path of [
      '/api/v1/radar?audience=all',
      `/api/v1/topics/${id}`,
      `/api/v1/topics/${id}/adaptations`,
      '/api/v1/calendar',
      '/api/v1/sensor',
      '/api/v1/references',
      '/api/v1/evaluation',
      '/api/v1/watches',
    ]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(nonIsoDates(await res.json()), path).toEqual([]);
    }
  });

  it('says why a platform filter leaves the radar short', async () => {
    const deps = await seeded();
    const app = createApp(deps);
    type Week = {
      topics: unknown[];
      coverage: { platform: string; pieces: number; reason: string } | null;
    };
    const instagram = (await (
      await app.request('/api/v1/radar?platform=instagram&audience=all')
    ).json()) as Week;
    expect(instagram.topics).toHaveLength(0);
    expect(instagram.coverage).toMatchObject({ platform: 'instagram', pieces: 0 });
    expect(instagram.coverage?.reason).toContain('Instagram');
    const all = (await (await app.request('/api/v1/radar?audience=all')).json()) as Week;
    expect(all.coverage).toBeNull();
  });

  it('blames the 30X fit filter, not the platform, when that filter hid the topics', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    for (const t of week.topics) await topicDetail(deps, t.id);
    // Every topic now scores below the audience threshold.
    const rows = await deps.db.select().from(analyses);
    for (const r of rows.filter((r) => r.kind === 'fit'))
      await deps.db
        .update(analyses)
        .set({ payload: { ...(r.payload as object), score: 3 } })
        .where(and(eq(analyses.topicId, r.topicId), eq(analyses.kind, 'fit')));
    const res = await createApp(deps).request('/api/v1/radar?platform=bluesky&audience=30x');
    const body = (await res.json()) as {
      topics: unknown[];
      coverage: { reason: string } | null;
    };
    expect(body.topics).toHaveLength(0);
    expect(body.coverage?.reason).toContain('encaje con 30X');
    expect(body.coverage?.reason).toContain('Bluesky');
  });
});
