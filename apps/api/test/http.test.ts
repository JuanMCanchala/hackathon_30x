import { VENDORS } from '@recibido/dataset';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/http/app';
import { DemoService } from '../src/services/demo';
import { allPayments } from '../src/services/state';
import { billOf, fileOf, ingest, setup } from './helpers';

type Env = Awaited<ReturnType<typeof setup>>;
let c: Env;
let demo: DemoService | null = null;
afterEach(async () => {
  await demo?.idle();
  demo = null;
  await c?.dispose();
  c = undefined as unknown as Env;
});

async function server(env: Record<string, string> = {}) {
  c = await setup(env);
  demo = c.config.demoMode ? new DemoService(c, 0) : null;
  const app = createApp(c, demo);
  return (path: string, init?: RequestInit) => app.request(path, init);
}

function form(fields: Record<string, string | { bytes: Uint8Array; filename: string }>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields))
    body.append(k, typeof v === 'string' ? v : new File([new Uint8Array(v.bytes)], v.filename));
  return { method: 'POST', body };
}

describe('HTTP API', () => {
  it('answers health and refuses what it cannot read, in Spanish', async () => {
    const http = await server();
    expect((await http('/api/v1/health')).status).toBe(200);
    const exe = await http(
      '/api/v1/bills',
      form({ file: { bytes: Buffer.from('MZ'), filename: 'factura.exe' } }),
    );
    expect(exe.status).toBe(400);
    expect(((await exe.json()) as { error: string }).error).toMatch(/Formato no soportado/);
    const big = await http(
      '/api/v1/bills',
      form({ file: { bytes: new Uint8Array(10 * 1024 * 1024 + 1), filename: 'grande.pdf' } }),
    );
    expect(big.status).toBe(413);
    const bad = await http('/api/v1/bills/x/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pay-everything' }),
    });
    expect([bad.status, await bad.json()]).toEqual([400, { error: 'La solicitud no es válida.' }]);
    expect((await http('/api/v1/nada')).status).toBe(404);
    expect((await http('/openapi.json')).status).toBe(200);
  });

  it('an upload is always a new bill: a supersedesBillId field is ignored', async () => {
    const http = await server();
    await ingest(c, 'oct-03');
    const original = await billOf(c, 'oct-03');
    const res = await http(
      '/api/v1/bills',
      form({ file: fileOf('oct-03-r1'), supersedesBillId: original.id }),
    );
    expect(res.status).toBe(201);
    const { billId } = (await res.json()) as { billId: string };
    const receipt = (await (await http(`/api/v1/bills/${billId}`)).json()) as {
      bill: { supersedesBillId: string | null };
    };
    expect(receipt.bill.supersedesBillId).toBeNull();
    expect((await billOf(c, 'oct-03')).status).toBe('PART_PAID');
  });

  it('hides the demo routes when DEMO_MODE=false', async () => {
    const http = await server({ DEMO_MODE: 'false' });
    expect((await http('/api/v1/demo/tour')).status).toBe(404);
    expect((await http('/api/v1/demo/reset', { method: 'POST' })).status).toBe(404);
    expect((await http('/api/v1/demo/actions/close-october', { method: 'POST' })).status).toBe(404);
  });

  it('the receipt of oct-03 carries the vendor message and the evidence of each line', async () => {
    const http = await server();
    await ingest(c, 'oct-03');
    const res = await http('/api/v1/bills/oct-03');
    expect(res.status).toBe(200);
    const receipt = (await res.json()) as {
      vendorMessage: string | null;
      lines: { evidence: unknown[]; supporting: unknown[] }[];
      payments: Record<string, unknown>[];
    };
    expect(receipt.vendorMessage).toMatch(/92 h/);
    expect(receipt.lines.length).toBeGreaterThan(0);
    for (const line of receipt.lines) {
      expect(Array.isArray(line.evidence)).toBe(true);
      expect(Array.isArray(line.supporting)).toBe(true);
    }
    expect(receipt.payments[0]).not.toHaveProperty('destination');
    expect(receipt.payments[0]?.destinationDisplay).toBe(
      VENDORS.find((v) => v.id === 'daniela-ospina')!.payout.display,
    );
  });

  it('the portal: an unknown token is 404, a valid one never shows payout destinations', async () => {
    const http = await server();
    await ingest(c, 'oct-03');
    expect((await http('/api/v1/portal/no-existe')).status).toBe(404);
    const [thread] = (await (await http('/api/v1/conversations')).json()) as {
      portalToken: string | null;
    }[];
    expect(thread?.portalToken).toBeTruthy();
    const res = await http(`/api/v1/portal/${thread!.portalToken}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/destination|payout/);
    for (const v of VENDORS) expect(text).not.toContain(v.payout.destination);

    const reply = await http(
      `/api/v1/portal/${thread!.portalToken}/reply`,
      form({ message: 'Tienen razón, fueron 92 h.', file: fileOf('oct-03-r1') }),
    );
    expect(reply.status).toBe(200);
    expect((await billOf(c, 'oct-03')).status).toBe('SUPERSEDED');
  });

  it('a GitHub webhook with a bad signature is refused and changes nothing', async () => {
    const http = await server({ GITHUB_WEBHOOK_SECRET: 'secreto' });
    await ingest(c, 'oct-05');
    const res = await http('/api/v1/webhooks/github', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': 'sha256=00' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    expect(await allPayments(c.db)).toHaveLength(0);
  });

  it('runs the guided tour over HTTP', async () => {
    const http = await server();
    const post = (path: string) => http(path, { method: 'POST' });
    expect((await post('/api/v1/demo/reset')).status).toBe(200);
    const tour = (await (await http('/api/v1/demo/tour')).json()) as { phase: string };
    expect(tour.phase).toBe('september');
    expect((await post('/api/v1/demo/actions/reply-daniela')).status).toBe(409);
    expect((await post('/api/v1/demo/actions/arrive-october')).status).toBe(200);
    expect((await post('/api/v1/demo/actions/inventada')).status).toBe(400);
  });
});
