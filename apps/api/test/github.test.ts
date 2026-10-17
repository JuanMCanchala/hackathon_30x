import { createHmac } from 'node:crypto';
import { VENDORS } from '@recibido/dataset';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allEvidence, allPayments } from '../src/services/state';
import { billOf, ingest, setup } from './helpers';

type Env = Awaited<ReturnType<typeof setup>>;
let c: Env;
afterEach(async () => {
  await c?.dispose();
  c = undefined as unknown as Env; // each test opens its own database
});

const REPO = 'altamar-labs/app-movil';
const SECRET = 'webhook-secret';
const MERGED_AT = '2026-10-15T16:00:00Z';

function pull(number: number, merged: boolean) {
  return {
    number,
    title: `PR ${number}`,
    html_url: `https://github.com/${REPO}/pull/${number}`,
    created_at: '2026-10-01T17:00:00Z',
    merged_at: merged ? MERGED_AT : null,
    user: { login: 'avillasenor' },
  };
}

/** GitHub's REST API, with PR #3 open until `merge()` is called. */
function fakeGithub() {
  let merged3 = false;
  const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const n = Number(String(url).split('/').at(-1));
    if (n === 404) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(pull(n, n !== 3 || merged3)), { status: 200 });
  });
  return { fetch, merge: () => (merged3 = true) };
}

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

const event = (number: number, repo = REPO) =>
  JSON.stringify({
    action: 'closed',
    repository: { full_name: repo },
    pull_request: { ...pull(number, true), merged: true },
  });

async function awaitingOct05(env: Record<string, string> = {}, fetch?: typeof globalThis.fetch) {
  c = await setup({ GITHUB_REPO: REPO, GITHUB_WEBHOOK_SECRET: SECRET, ...env }, { fetch });
  const { decision } = await ingest(c, 'oct-05');
  expect(decision?.outcome).toBe('ASK_VENDOR');
  await c.clock.set('2026-10-15T11:00:00-05:00');
}

describe('GitHub evidence', () => {
  it('poll turns an open PR into a merged one and pays oct-05', async () => {
    const gh = fakeGithub();
    await awaitingOct05({ GITHUB_TOKEN: 'gh-token' }, gh.fetch);
    expect(await c.github.poll()).toBe(0); // #1 and #2 already merged, #3 still open
    expect((await billOf(c, 'oct-05')).status).toBe('AWAITING_VENDOR');

    gh.merge();
    expect(await c.github.poll()).toBe(1);
    const bill = await billOf(c, 'oct-05');
    expect(bill.status).toBe('PAID');
    const [payment] = await allPayments(c.db);
    expect(payment).toMatchObject({
      billId: bill.id,
      amountMinor: 8_500_000,
      destination: VENDORS.find((v) => v.id === 'andres-villasenor')!.payout.destination,
    });
    const item = (await allEvidence(c.db)).find((e) => e.ref === `${REPO}#3`);
    expect(item).toMatchObject({ kind: 'pr_merged', origin: 'live', occurredAt: MERGED_AT });

    const [url, init] = gh.fetch.mock.calls.at(-1)!;
    expect(String(url)).toBe(`https://api.github.com/repos/${REPO}/pulls/3`);
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer gh-token',
      'User-Agent': 'recibido',
      Accept: 'application/vnd.github+json',
    });
  });

  it.each([403, 404, 429])('a %i leaves the evidence unchanged', async (status) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetch = vi.fn(async () => new Response('{}', { status }));
    await awaitingOct05({}, fetch);
    const before = await allEvidence(c.db);
    expect(await c.github.poll()).toBe(0);
    expect(await allEvidence(c.db)).toEqual(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a webhook with a bad signature changes nothing', async () => {
    await awaitingOct05();
    const before = await allEvidence(c.db);
    const body = event(3);
    for (const signature of [sign(body, 'wrong'), 'sha256=abc', null])
      expect(await c.github.handleWebhook(body, signature, 'pull_request')).toEqual({
        accepted: false,
        reason: 'bad_signature',
      });
    expect(await allEvidence(c.db)).toEqual(before);
    expect((await billOf(c, 'oct-05')).status).toBe('AWAITING_VENDOR');
  });

  it('a webhook for an untracked PR changes nothing', async () => {
    await awaitingOct05();
    const before = await allEvidence(c.db);
    for (const body of [event(99), event(3, 'someone/else')])
      expect(await c.github.handleWebhook(body, sign(body), 'pull_request')).toEqual({
        accepted: false,
        reason: 'untracked',
      });
    expect(await allEvidence(c.db)).toEqual(before);
    expect(await allPayments(c.db)).toHaveLength(0);
  });

  it('a webhook is ignored when no secret is configured', async () => {
    await awaitingOct05({ GITHUB_WEBHOOK_SECRET: '' });
    const body = event(3);
    expect(await c.github.handleWebhook(body, sign(body), 'pull_request')).toEqual({
      accepted: false,
      reason: 'no_secret',
    });
    expect(await allPayments(c.db)).toHaveLength(0);
  });

  it('a valid signed merged webhook pays oct-05', async () => {
    await awaitingOct05();
    const body = event(3);
    expect(await c.github.handleWebhook(body, sign(body), 'push')).toMatchObject({
      accepted: false,
    });
    expect(await c.github.handleWebhook(body, sign(body), 'pull_request')).toEqual({
      accepted: true,
      changed: true,
    });
    expect((await billOf(c, 'oct-05')).status).toBe('PAID');
    // the same delivery again pays nothing more
    expect(await c.github.handleWebhook(body, sign(body), 'pull_request')).toEqual({
      accepted: true,
      changed: false,
    });
    expect(await allPayments(c.db)).toHaveLength(1);
  });

  it('simulateMerge pays oct-05 in demo mode without GitHub', async () => {
    c = await setup();
    await ingest(c, 'oct-05');
    expect(await c.github.simulateMerge('nobody/else#3')).toBe(false);
    expect(await c.github.simulateMerge(`${REPO}#3`)).toBe(true);
    expect((await billOf(c, 'oct-05')).status).toBe('PAID');
    const item = (await allEvidence(c.db)).find((e) => e.ref === `${REPO}#3`);
    expect(item).toMatchObject({ kind: 'pr_merged', origin: 'fixture' });
    expect(item?.title).toContain('simulado');
  });

  it('the seed points the live milestone at the configured repository and PR', async () => {
    c = await setup({ GITHUB_REPO: 'nicolas/demo', GITHUB_DEMO_PR: '7' });
    expect(await c.github.trackedPrs()).toContainEqual({
      vendorId: 'andres-villasenor',
      repo: 'nicolas/demo',
      number: 7,
    });
    const pending = (await allEvidence(c.db)).find((e) => e.ref === 'nicolas/demo#7');
    expect(pending).toMatchObject({ kind: 'pr_open', id: 'gh-demo-7' });
  });
});
