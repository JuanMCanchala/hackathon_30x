import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  adaptations,
  approvals,
  maquetas,
  runs,
  topics,
  watchHits,
  watches,
} from '../src/db/schema';
import { createApp } from '../src/http/app';
import { saveItems } from '../src/pipeline/ingest';
import { approve, calendar, type CalendarEntry } from '../src/services/adapt';
import type { Deps } from '../src/services/deps';
import {
  MaquetaBody,
  createMaqueta,
  listMaquetas,
  type MaquetaView,
} from '../src/services/maquetas';
import { exportSnapshot, importSnapshotIfEmpty } from '../src/services/snapshot';
import { nonIsoDates, testContainer, type FixedClock } from './helpers';
import { NOW, post } from './week';

const TOKEN = 'radar-admin-token';
const admin = { authorization: `Bearer ${TOKEN}` };

type Failure = { error: { code: string; message: string; issues?: { path: string }[] } };

const style = {
  preset: '30x-noche',
  bg: '#0B0B0F',
  ink: '#FFFFFF',
  accent: '#FF5A1F',
  soft: '#1C1C24',
  font: 'hanken',
  headline: 'grueso',
  align: 'izquierda',
  texture: 'ondas',
  brand: { name: '30X', handle: '@30x', logo: true },
};

/** A maqueta as the web sends it: the second slide leaves kicker and body to their defaults. */
const design = (name: string, extra: object = {}) => ({
  name,
  format: 'carrusel',
  style,
  slides: [
    {
      layout: 'portada',
      kicker: 'IA',
      title: 'Agentes en tu pyme',
      body: 'Lo que cambia este año.',
    },
    { layout: 'cierre', title: 'Empieza hoy' },
  ],
  ...extra,
});

/** A maqueta written straight to the database, at a given instant. */
const stored = (id: string, at: string) => ({
  id,
  name: id,
  format: 'post',
  style,
  slides: [{ layout: 'titular', kicker: '', title: id, body: '' }],
  createdAt: at,
  updatedAt: at,
});

const adaptation = {
  angle: 'Los agentes llegan a la pyme latinoamericana.',
  hooks: ['3 tareas que ya no haces', '¿Y si nadie respondiera correos?', 'No es un chatbot'],
  linkedin: 'Post de prueba.',
  carousel: [{ title: 'Uno', body: 'Texto' }],
  reel: { hook: 'Gancho', beats: ['Uno'], onScreen: ['Texto'], cta: 'Prueba hoy' },
  youtube: { title: 'Título', thumbnail: 'Miniatura' },
  avoid: ['El hype'],
  inspiredBy: [],
};

/** A topic with one adaptation, as «Cómo lo contamos» leaves it. */
async function topicWithAdaptation(deps: Deps) {
  await deps.db
    .insert(topics)
    .values({ id: 't_agentes', name: 'Agentes de IA', centroid: [1, 0], createdAt: NOW });
  await deps.db.insert(adaptations).values({
    id: 'adp_agentes',
    topicId: 't_agentes',
    week: '2026-10-12',
    payload: adaptation,
    createdAt: NOW,
  });
}

async function setup(config: { ADMIN_TOKEN?: string; DEMO_MODE?: boolean } = {}) {
  const { deps } = await testContainer({ now: NOW });
  deps.config = { ...deps.config, ...config };
  const app = createApp(deps);
  const call = async <T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as T };
  };
  const events: string[] = [];
  deps.bus.subscribe((e) => events.push(e.type));
  return { deps, app, call, events, clock: deps.clock as FixedClock };
}

describe('maquetas', () => {
  it('creates, reads, lists, edits and deletes a maqueta', async () => {
    const { call, events, clock } = await setup();
    const created = await call<MaquetaView>('POST', '/api/v1/maquetas', design('Carrusel noche'));
    expect(created.status).toBe(201);
    const m = created.body;
    expect(m.id).toMatch(/^mqt_/);
    expect(m.slides[1]).toEqual({ layout: 'cierre', kicker: '', title: 'Empieza hoy', body: '' });
    expect(m).toMatchObject({ origin: null, basedOn: null, removable: true });
    expect(m.createdAt).toBe('2026-10-17T18:00:00.000Z');
    expect(m.updatedAt).toBe(m.createdAt);

    clock.set('2026-10-17T19:00:00Z');
    const copy = await call<MaquetaView>(
      'POST',
      '/api/v1/maquetas',
      design('Copia', { basedOn: m.id }),
    );
    expect(copy.body.basedOn).toBe(m.id);

    clock.set('2026-10-17T20:00:00Z');
    const edited = await call<MaquetaView>(
      'PUT',
      `/api/v1/maquetas/${m.id}`,
      design('Carrusel noche v2', { format: 'post' }),
    );
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      id: m.id,
      name: 'Carrusel noche v2',
      format: 'post',
      createdAt: m.createdAt,
      updatedAt: '2026-10-17T20:00:00.000Z',
    });

    // The most recently edited first.
    const list = await call<MaquetaView[]>('GET', '/api/v1/maquetas');
    expect(list.body.map((x) => x.id)).toEqual([m.id, copy.body.id]);
    expect(nonIsoDates(list.body)).toEqual([]);
    expect((await call('GET', `/api/v1/maquetas/${m.id}`)).body).toEqual(edited.body);

    expect((await call('DELETE', `/api/v1/maquetas/${m.id}`)).body).toEqual({ ok: true });
    expect((await call('GET', `/api/v1/maquetas/${m.id}`)).status).toBe(404);
    expect((await call('PUT', `/api/v1/maquetas/${m.id}`, design('x'))).status).toBe(404);
    expect((await call('DELETE', `/api/v1/maquetas/${m.id}`)).status).toBe(404);
    expect(events).toEqual([
      'maqueta.changed',
      'maqueta.changed',
      'maqueta.changed',
      'maqueta.changed',
    ]);
  });

  it('refuses a color that is not a hex code, a maqueta without slides, and the 301st', async () => {
    const { deps, call } = await setup();
    const bad = await call<Failure>(
      'POST',
      '/api/v1/maquetas',
      design('Mal', { style: { ...style, accent: 'naranja' } }),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    expect(bad.body.error.issues?.map((i) => i.path)).toContain('style.accent');
    expect((await call('POST', '/api/v1/maquetas', design('Vacía', { slides: [] }))).status).toBe(
      400,
    );
    expect((await call('POST', '/api/v1/maquetas', design('   '))).status).toBe(400);

    await deps.db
      .insert(maquetas)
      .values(Array.from({ length: 300 }, (_, i) => stored(`mqt_${i}`, NOW)));
    const full = await call<Failure>('POST', '/api/v1/maquetas', design('Una más'));
    expect(full.status).toBe(409);
    expect(full.body.error.message).toBe(
      'Ya hay 300 maquetas guardadas. Borra alguna para crear otra.',
    );
  });
});

describe('the calendar, v2', () => {
  it('schedules a maqueta at an hour and orders each day by hour, untimed pieces last', async () => {
    const { deps, call, clock } = await setup();
    await topicWithAdaptation(deps);
    const origin = {
      kind: 'topic',
      topicId: 't_agentes',
      adaptationId: 'adp_agentes',
      name: 'Agentes de IA',
    };
    const m = (await call<MaquetaView>('POST', '/api/v1/maquetas', design('Agentes', { origin })))
      .body;

    const evening = await call<CalendarEntry>('POST', '/api/v1/calendar', {
      maquetaId: m.id,
      scheduledFor: '2026-10-20',
      scheduledTime: '18:30',
    });
    expect(evening.status).toBe(200);
    expect(evening.body).toMatchObject({
      adaptationId: 'adp_agentes',
      topicId: 't_agentes',
      topicName: 'Agentes de IA',
      format: 'Carrusel de Instagram',
      title: 'Agentes en tu pyme',
      body: '1. Agentes en tu pyme\nLo que cambia este año.\n\n2. Empieza hoy\n',
      scheduledFor: '2026-10-20',
      scheduledTime: '18:30',
      approvedBy: 'Equipo de medios 30X',
      approvedAt: '2026-10-17T18:00:00.000Z',
      maquetaId: m.id,
      origin: null,
      removable: true,
    });
    expect(evening.body.maqueta).toMatchObject({ id: m.id, name: 'Agentes', style });

    // Approved later, but one has no hour and the other is in the morning.
    clock.set('2026-10-17T19:00:00Z');
    const untimed = await call<CalendarEntry>('POST', '/api/v1/calendar', {
      adaptationId: 'adp_agentes',
      format: 'linkedin',
      scheduledFor: '2026-10-20',
    });
    expect(untimed.body).toMatchObject({
      format: 'Post de LinkedIn',
      title: '3 tareas que ya no haces',
      scheduledTime: null,
      maquetaId: null,
      maqueta: null,
    });
    clock.set('2026-10-17T20:00:00Z');
    const morning = await call<CalendarEntry>('POST', '/api/v1/calendar', {
      adaptationId: 'adp_agentes',
      format: 'reel',
      scheduledFor: '2026-10-20',
      scheduledTime: '09:00',
    });
    const dayBefore = await call<CalendarEntry>('POST', '/api/v1/calendar', {
      maquetaId: m.id,
      scheduledFor: '2026-10-19',
      scheduledTime: '23:00',
    });

    const all = await call<CalendarEntry[]>('GET', '/api/v1/calendar');
    expect(all.body.map((e) => e.id)).toEqual([
      dayBefore.body.id,
      morning.body.id,
      evening.body.id,
      untimed.body.id,
    ]);
    expect(nonIsoDates(all.body)).toEqual([]);

    // An adaptation needs its format; an hour must be one.
    const noFormat = await call<Failure>('POST', '/api/v1/calendar', {
      adaptationId: 'adp_agentes',
      scheduledFor: '2026-10-20',
    });
    expect(noFormat.status).toBe(400);
    const lateHour = { maquetaId: m.id, scheduledFor: '2026-10-20', scheduledTime: '24:00' };
    expect((await call('POST', '/api/v1/calendar', lateHour)).status).toBe(400);
    const missing = { maquetaId: 'mqt_none', scheduledFor: '2026-10-20' };
    expect((await call('POST', '/api/v1/calendar', missing)).status).toBe(404);
  });

  it('moves a piece to another day and hour', async () => {
    const { call, events, app } = await setup();
    const m = (await call<MaquetaView>('POST', '/api/v1/maquetas', design('Agentes'))).body;
    const { id } = (
      await call<CalendarEntry>('POST', '/api/v1/calendar', {
        maquetaId: m.id,
        scheduledFor: '2026-10-20',
      })
    ).body;

    const moved = await call<CalendarEntry>('PATCH', `/api/v1/calendar/${id}`, {
      scheduledFor: '2026-10-22',
      scheduledTime: '07:15',
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ id, scheduledFor: '2026-10-22', scheduledTime: '07:15' });
    const untimed = await call<CalendarEntry>('PATCH', `/api/v1/calendar/${id}`, {
      scheduledTime: null,
    });
    expect(untimed.body).toMatchObject({ scheduledFor: '2026-10-22', scheduledTime: null });
    expect(events.filter((e) => e === 'calendar.changed')).toHaveLength(3);

    expect((await call('PATCH', `/api/v1/calendar/${id}`, {})).status).toBe(400);
    const badHour = { scheduledTime: '7:15' };
    expect((await call('PATCH', `/api/v1/calendar/${id}`, badHour)).status).toBe(400);
    const noSuchDay = { scheduledFor: '2026-02-31' };
    expect((await call('PATCH', `/api/v1/calendar/${id}`, noSuchDay)).status).toBe(400);
    const elsewhere = { scheduledFor: '2026-10-22' };
    expect((await call('PATCH', '/api/v1/calendar/cal_none', elsewhere)).status).toBe(404);

    // The browser may send PUT and PATCH across origins.
    const preflight = await app.request(`/api/v1/calendar/${id}`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3300', 'access-control-request-method': 'PATCH' },
    });
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PATCH');
    expect(preflight.headers.get('access-control-allow-methods')).toContain('PUT');
  });

  it('schedules a piece Vigía caught once it is adapted, and keeps it if the topic goes', async () => {
    const { deps, call } = await setup();
    await deps.db
      .insert(watches)
      .values({ id: 'wch_negocios', term: 'negocios', plan: {}, langs: ['en'], createdAt: NOW });
    await saveItems(deps, [
      post('viral', 'someone', 'How AI agents change small business', 0, 900),
    ]);
    await deps.db.insert(watchHits).values({
      watchId: 'wch_negocios',
      itemId: 'bluesky:viral',
      runId: 'wrn_1',
      foundAt: NOW,
      lang: 'en',
      score: 1,
      reasons: [],
    });
    const plan = (body: object) =>
      call<CalendarEntry & Failure>('POST', '/api/v1/calendar', {
        scheduledFor: '2026-10-21',
        ...body,
      });
    const piece = { watchId: 'wch_negocios', itemId: 'bluesky:viral' };

    const early = await plan({ ...piece, format: 'carousel' });
    expect(early.status).toBe(409);
    expect(early.body.error).toEqual({ code: 'not_adapted', message: 'Primero adapta la pieza.' });
    const unknown = { watchId: 'wch_negocios', itemId: 'bluesky:none', format: 'carousel' };
    expect((await plan(unknown)).status).toBe(404);

    await deps.db
      .update(watchHits)
      .set({ adaptation })
      .where(eq(watchHits.itemId, 'bluesky:viral'));
    expect((await plan(piece)).status).toBe(400);
    const entry = await plan({ ...piece, format: 'carousel', scheduledTime: '12:00' });
    expect(entry.status).toBe(200);
    expect(entry.body).toMatchObject({
      adaptationId: null,
      topicId: null,
      topicName: 'negocios',
      format: 'Carrusel de Instagram',
      title: 'Uno',
      body: '1. Uno\nTexto',
      scheduledTime: '12:00',
      origin: { kind: 'vigia', watchId: 'wch_negocios', itemId: 'bluesky:viral', term: 'negocios' },
    });

    // A LinkedIn post opens with the hook the team chose, title and text alike.
    const linkedin = await plan({ ...piece, format: 'linkedin', hook: 1 });
    expect(linkedin.status).toBe(200);
    expect(linkedin.body.title).toBe(adaptation.hooks[1]);
    expect(linkedin.body.body.startsWith(`${adaptation.hooks[1]}\n\n`)).toBe(true);

    // A maqueta drafted from the same piece carries where it was caught.
    const caught = { kind: 'vigia', ...piece, name: 'negocios' };
    const m = (
      await call<MaquetaView>(
        'POST',
        '/api/v1/maquetas',
        design('Desde Vigía', { format: 'historia', origin: caught }),
      )
    ).body;
    const fromMaqueta = await plan({ maquetaId: m.id, ...piece, format: 'reel' });
    expect(fromMaqueta.body).toMatchObject({
      format: 'Historia o Reel',
      topicName: 'negocios',
      maquetaId: m.id,
      origin: { kind: 'vigia', ...piece, term: 'negocios' },
    });

    const nothing = await plan({ format: 'carousel' });
    expect(nothing.status).toBe(400);
    expect(nothing.body.error.message).toBe(
      'Falta qué programar: una adaptación, una maqueta o una pieza de Vigía.',
    );

    // Unfollowing the topic deletes its hits, not what the team planned.
    expect((await call('DELETE', '/api/v1/watches/wch_negocios')).status).toBe(200);
    const left = (await call<CalendarEntry[]>('GET', '/api/v1/calendar')).body;
    expect(left.map((e) => e.topicName)).toEqual(['negocios', 'negocios', 'negocios']);
  });

  it('keeps the pieces of a deleted maqueta on the calendar, with their text', async () => {
    const { call } = await setup();
    const m = (await call<MaquetaView>('POST', '/api/v1/maquetas', design('Agentes'))).body;
    const entry = (
      await call<CalendarEntry>('POST', '/api/v1/calendar', {
        maquetaId: m.id,
        scheduledFor: '2026-10-20',
      })
    ).body;
    expect(entry.topicName).toBe('Agentes');

    expect((await call('DELETE', `/api/v1/maquetas/${m.id}`)).status).toBe(200);
    const [kept] = (await call<CalendarEntry[]>('GET', '/api/v1/calendar')).body;
    expect(kept).toMatchObject({
      id: entry.id,
      maquetaId: null,
      maqueta: null,
      topicName: 'Sin tema',
      title: 'Agentes en tu pyme',
      body: entry.body,
    });
  });

  it('lets visitors change what they added, and only an admin the demo week’s own', async () => {
    const { deps, call } = await setup({ ADMIN_TOKEN: TOKEN, DEMO_MODE: true });
    // The demo week's rows, then the import marker, then what a visitor adds at NOW.
    await deps.db.insert(maquetas).values(stored('mqt_demo', '2026-10-17T12:00:00Z'));
    await deps.db.insert(approvals).values({
      id: 'cal_demo',
      maquetaId: 'mqt_demo',
      format: 'Post de Instagram',
      title: 'mqt_demo',
      body: '1. mqt_demo\n',
      scheduledFor: '2026-10-20',
      approvedBy: 'Equipo de medios 30X',
      approvedAt: '2026-10-17T12:00:00Z',
    });
    await deps.db.insert(runs).values({
      id: 'run_snapshot_import',
      kind: 'snapshot-import',
      startedAt: '2026-10-17T14:00:00Z',
      finishedAt: '2026-10-17T14:00:30Z',
    });
    const mine = (await call<MaquetaView>('POST', '/api/v1/maquetas', design('Mía'))).body;
    const entry = (
      await call<CalendarEntry>('POST', '/api/v1/calendar', {
        maquetaId: mine.id,
        scheduledFor: '2026-10-21',
      })
    ).body;

    const removable = <T extends { id: string; removable: boolean }>(rows: T[]) =>
      Object.fromEntries(rows.map((r) => [r.id, r.removable]));
    expect(removable((await call<MaquetaView[]>('GET', '/api/v1/maquetas')).body)).toEqual({
      mqt_demo: false,
      [mine.id]: true,
    });
    const planned = (await call<CalendarEntry[]>('GET', '/api/v1/calendar')).body;
    expect(removable(planned)).toEqual({ cal_demo: false, [entry.id]: true });
    expect(planned.find((e) => e.id === 'cal_demo')?.maqueta?.removable).toBe(false);

    // Without the token, the demo's rows stay as they are.
    const at10 = { scheduledTime: '10:00' };
    expect((await call('PATCH', '/api/v1/calendar/cal_demo', at10)).status).toBe(401);
    expect((await call('DELETE', '/api/v1/calendar/cal_demo')).status).toBe(401);
    expect((await call('PUT', '/api/v1/maquetas/mqt_demo', design('Otra'))).status).toBe(401);
    expect((await call('DELETE', '/api/v1/maquetas/mqt_demo')).status).toBe(401);
    // The visitor's own change freely.
    expect((await call('PATCH', `/api/v1/calendar/${entry.id}`, at10)).status).toBe(200);
    expect((await call('PUT', `/api/v1/maquetas/${mine.id}`, design('Mía v2'))).status).toBe(200);
    expect((await call('DELETE', `/api/v1/calendar/${entry.id}`)).status).toBe(200);
    expect((await call('DELETE', `/api/v1/maquetas/${mine.id}`)).status).toBe(200);
    // The admin changes the demo's too.
    expect((await call('PATCH', '/api/v1/calendar/cal_demo', at10, admin)).status).toBe(200);
    expect((await call('PUT', '/api/v1/maquetas/mqt_demo', design('Otra'), admin)).status).toBe(
      200,
    );
    expect((await call('DELETE', '/api/v1/calendar/cal_demo', undefined, admin)).status).toBe(200);
    expect((await call('DELETE', '/api/v1/maquetas/mqt_demo', undefined, admin)).status).toBe(200);
  });

  it('loads demo weeks exported before and after maquetas', async () => {
    const { deps: source } = await testContainer({ now: NOW });
    source.config = { ...source.config, SNAPSHOT_DIR: mkdtempSync(join(tmpdir(), 'radar-snap-')) };
    await saveItems(source, [post('p1', 'ana', 'Agentes de IA en la pyme', 1, 10)]);
    await topicWithAdaptation(source);
    const m = await createMaqueta(source, MaquetaBody.parse(design('Agentes')));
    await approve(source, {
      maquetaId: m.id,
      scheduledFor: '2026-10-20',
      scheduledTime: '10:00',
      approvedBy: 'Equipo de medios 30X',
    });
    await approve(source, {
      adaptationId: 'adp_agentes',
      format: 'linkedin',
      scheduledFor: '2026-10-21',
      approvedBy: 'Equipo de medios 30X',
    });
    await exportSnapshot(source);
    const dir = source.config.SNAPSHOT_DIR;

    const load = async () => {
      const { deps } = await testContainer({ now: '2026-10-18T09:00:00Z' });
      deps.config = { ...deps.config, SNAPSHOT_DIR: dir };
      expect(await importSnapshotIfEmpty(deps)).toBeGreaterThan(0);
      return deps;
    };

    const now = await load();
    const [withDesign, plain] = await calendar(now);
    expect(withDesign).toMatchObject({ scheduledTime: '10:00', removable: false });
    expect(withDesign?.maqueta).toMatchObject({ id: m.id, removable: false });
    expect(plain).toMatchObject({ topicName: 'Agentes de IA', removable: false });
    expect((await listMaquetas(now)).map((x) => x.id)).toEqual([m.id]);

    // As a snapshot from before: no maquetas file, no pieces from one, no new columns.
    rmSync(join(dir, 'maquetas.jsonl.gz'));
    const path = join(dir, 'approvals.jsonl.gz');
    const old = gunzipSync(readFileSync(path))
      .toString('utf8')
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((r) => r.maquetaId === null)
      .map(({ maquetaId: _m, scheduledTime: _t, origin: _o, ...rest }) => JSON.stringify(rest));
    writeFileSync(path, gzipSync(old.join('\n')));
    const before = await load();
    expect(await calendar(before)).toMatchObject([
      {
        topicName: 'Agentes de IA',
        format: 'Post de LinkedIn',
        scheduledTime: null,
        maquetaId: null,
        maqueta: null,
        origin: null,
        removable: false,
      },
    ]);
  });
});
