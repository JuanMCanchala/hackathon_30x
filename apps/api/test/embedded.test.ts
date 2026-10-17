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
});
