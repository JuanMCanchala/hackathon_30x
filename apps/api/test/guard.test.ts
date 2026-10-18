import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { watches } from '../src/db/schema';
import { createApp } from '../src/http/app';
import { testContainer } from './helpers';

const TOKEN = 'radar-admin-token';

async function appWith(config: { ADMIN_TOKEN?: string; DEMO_MODE: boolean }) {
  const { deps } = await testContainer();
  deps.config = {
    ...deps.config,
    ...config,
    SNAPSHOT_DIR: mkdtempSync(join(tmpdir(), 'radar-snapshot-')),
  };
  return { deps, app: createApp(deps) };
}

const admin = { authorization: `Bearer ${TOKEN}` };

describe('destructive and paid endpoints', () => {
  it('refuse a request without the admin token and accept one with it', async () => {
    const { app } = await appWith({ ADMIN_TOKEN: TOKEN, DEMO_MODE: true });
    const routes: [string, string][] = [
      ['POST', '/api/v1/pipeline/run'],
      ['POST', '/api/v1/snapshot'],
      ['DELETE', '/api/v1/watches/wch_x'],
      ['DELETE', '/api/v1/calendar/apr_x'],
    ];
    for (const [method, path] of routes) {
      expect((await app.request(path, { method })).status, path).toBe(401);
      const wrong = { authorization: 'Bearer nope' };
      expect((await app.request(path, { method, headers: wrong })).status, path).toBe(401);
    }
    // With the token the request reaches the route: a bad body, a missing id, a written file.
    const run = await app.request('/api/v1/pipeline/run', {
      method: 'POST',
      headers: { ...admin, 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 0 }),
    });
    expect(run.status).toBe(400);
    expect(
      (await app.request('/api/v1/watches/wch_x', { method: 'DELETE', headers: admin })).status,
    ).toBe(404);
    expect(
      (await app.request('/api/v1/calendar/apr_x', { method: 'DELETE', headers: admin })).status,
    ).toBe(404);
    expect((await app.request('/api/v1/snapshot', { method: 'POST', headers: admin })).status).toBe(
      200,
    );
  });

  it('stay closed in the demo when no admin token is configured', async () => {
    const { app } = await appWith({ DEMO_MODE: true });
    const res = await app.request('/api/v1/watches/wch_x', { method: 'DELETE', headers: admin });
    expect(res.status).toBe(403);
  });

  it('stay open on a local radar outside the demo', async () => {
    const { app } = await appWith({ DEMO_MODE: false });
    expect((await app.request('/api/v1/watches/wch_x', { method: 'DELETE' })).status).toBe(404);
  });

  it('refuse a sixth active followed topic', async () => {
    const { deps, app } = await appWith({ DEMO_MODE: true });
    for (let i = 0; i < 5; i++)
      await deps.db.insert(watches).values({
        id: `wch_${i}`,
        term: `tema ${i}`,
        plan: {},
        langs: ['en', 'pt'],
        windowHours: 72,
        everyMinutes: 60,
        budget: 12,
        active: true,
        createdAt: '2026-10-17T18:00:00Z',
        lastRunAt: null,
      });
    const res = await app.request('/api/v1/watches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'negocios' }),
    });
    expect(res.status).toBe(409);
  });

  it('limit how often one visitor asks the model', async () => {
    const { app } = await appWith({ DEMO_MODE: true });
    const ask = (ip: string) =>
      app.request('/api/v1/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
        body: JSON.stringify({ question: '?' }),
      });
    for (let i = 0; i < 20; i++) expect((await ask('203.0.113.7')).status).toBe(400);
    const limited = await ask('203.0.113.7');
    expect(limited.status).toBe(429);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe('rate_limited');
    expect((await ask('198.51.100.2')).status).toBe(400);
  });

  it('answer CORS only for the web app', async () => {
    const { app } = await appWith({ DEMO_MODE: true });
    const from = async (origin: string) =>
      (await app.request('/api/v1/health', { headers: { origin } })).headers.get(
        'access-control-allow-origin',
      );
    expect(await from('https://evil.example')).not.toBe('https://evil.example');
    expect(await from('http://localhost:3300')).toBe('http://localhost:3300');
  });

  it('count a topic page that asks the model to write again against the same limit', async () => {
    const { app } = await appWith({ DEMO_MODE: true });
    const open = (refresh: boolean) =>
      app.request(`/api/v1/topics/t_none${refresh ? '?refresh=1' : ''}`, {
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });
    for (let i = 0; i < 20; i++) expect((await open(true)).status).toBe(404);
    expect((await open(true)).status).toBe(429);
    // Reading the stored page stays free.
    expect((await open(false)).status).toBe(404);
  });

  it('answer 400, not 500, to a body that is not JSON', async () => {
    const { app } = await appWith({ DEMO_MODE: true });
    const res = await app.request('/api/v1/calendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('bad_request');
  });
});
