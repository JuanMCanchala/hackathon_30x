import { describe, expect, it } from 'vitest';
import { createEmbeddedApi } from '../src/embedded';

const ENV = {
  DEMO_MODE: 'true',
  DEMO_PACE_MS: '0',
  READER: 'auto',
  LLM_PROVIDER: 'none',
} as NodeJS.ProcessEnv;
const BASE = 'http://recibido.test';

type Api = Awaited<ReturnType<typeof createEmbeddedApi>>;

async function call(api: Api, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  const response = await api.handle(new Request(`${BASE}${path}`, { ...init, headers }));
  return {
    status: response.status,
    cookie: response.headers.get('set-cookie')?.split(';')[0],
    body: (await response.json()) as Record<string, unknown>,
  };
}

const billIds = async (api: Api, cookie?: string) =>
  ((await call(api, '/api/v1/bills', { cookie })).body as unknown as { id: string }[])
    .map((b) => b.id)
    .sort();

describe('the embedded API across instances', () => {
  it('replays the tour the visitor carries, with the same ids', async () => {
    const first = await createEmbeddedApi(ENV);
    const reset = await call(first, '/api/v1/demo/reset', { method: 'POST' });
    expect(reset.cookie).toBe('recibido-tour=-');
    const arrive = await call(first, '/api/v1/demo/actions/arrive-october', { method: 'POST' });
    expect(arrive.cookie).toBe('recibido-tour=arrive-october');
    await first.idle();
    const reply = await call(first, '/api/v1/demo/actions/reply-daniela', {
      method: 'POST',
      cookie: arrive.cookie,
    });
    expect(reply.cookie).toBe('recibido-tour=arrive-october.reply-daniela');
    const ids = await billIds(first, reply.cookie);
    const overview = (await call(first, '/api/v1/overview', { cookie: reply.cookie })).body;

    // a fresh instance (cold start at October 1) brought to the visitor's step
    const second = await createEmbeddedApi(ENV);
    expect(await billIds(second, reply.cookie)).toEqual(ids);
    expect((await call(second, '/api/v1/overview', { cookie: reply.cookie })).body).toEqual(
      overview,
    );
    const tour = (await call(second, '/api/v1/demo/tour', { cookie: reply.cookie })).body;
    expect(tour.phase).toBe('october');

    // without the cookie the instance serves what it has; an edited one changes nothing
    expect(
      (await call(second, '/api/v1/demo/tour', { cookie: 'recibido-tour=pay-everything' })).body
        .phase,
    ).toBe('october');
  }, 120_000);

  it('two visitors on one instance do not reset each other by polling', async () => {
    const api = await createEmbeddedApi(ENV);
    const a = (await call(api, '/api/v1/demo/actions/arrive-october', { method: 'POST' })).cookie;
    await api.idle();
    // B reset on another instance and then landed here: their polls never rewind the instance
    for (const cookie of [a, 'recibido-tour=-', a, 'recibido-tour=-']) {
      const tour = await call(api, '/api/v1/demo/tour', { cookie });
      expect(tour.body.phase).toBe('october');
      if (cookie !== a) expect(tour.cookie).toBe(a);
    }
  }, 120_000);

  it('a cookie the tour cannot take converges to the instance after one request', async () => {
    const api = await createEmbeddedApi(ENV);
    const first = await call(api, '/api/v1/demo/tour', { cookie: 'recibido-tour=merge-pr' });
    expect(first.body.phase).toBe('september');
    expect(first.cookie).toBe('recibido-tour=-');
    const second = await call(api, '/api/v1/demo/tour', { cookie: first.cookie });
    expect(second.cookie).toBeUndefined();
    const edited = await call(api, '/api/v1/demo/tour', { cookie: 'recibido-tour=pay-everything' });
    expect(edited.cookie).toBe('recibido-tour=-');
  }, 120_000);

  it('replays forward only the missing steps, keeping what the instance already has', async () => {
    const api = await createEmbeddedApi(ENV);
    const a = (await call(api, '/api/v1/demo/actions/arrive-october', { method: 'POST' })).cookie;
    await api.idle();
    // something outside the tour, in this instance only: a reset would drop it
    const form = new FormData();
    form.append('file', new Blob(['Cuenta de cobro sin datos']), 'nota.txt');
    expect(
      (await call(api, '/api/v1/bills', { method: 'POST', body: form, cookie: a })).status,
    ).toBe(201);
    const before = (await billIds(api, a)).length;
    const ahead = `${a}.reply-daniela`;
    const tour = await call(api, '/api/v1/demo/tour', { cookie: ahead });
    expect(tour.cookie).toBeUndefined();
    expect(
      (tour.body.actions as { id: string; done: boolean }[]).find((x) => x.id === 'reply-daniela')
        ?.done,
    ).toBe(true);
    // the corrected bill arrived; the upload is still there
    expect((await billIds(api, ahead)).length).toBe(before + 1);
  }, 120_000);
});
