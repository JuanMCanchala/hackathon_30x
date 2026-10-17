import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AGENTS, filePath, findBill, INITIAL_POLICY } from '@mandato/dataset';
import type { Container } from '../src/container';
import { createApp } from '../src/http/app';
import { demoContainer } from './helpers';

let container: Container;
let app: ReturnType<typeof createApp>;
const agentKey = AGENTS[0]!.demoKey;

const as = (user: string, init: RequestInit = {}) => ({
  ...init,
  headers: { 'x-mandato-user': user, 'content-type': 'application/json', ...(init.headers ?? {}) },
});

beforeAll(async () => {
  container = await demoContainer({ now: '2026-08-04T15:00:00Z' });
  app = createApp(container.deps);
});
afterAll(() => container.database.close());

describe('HTTP API', () => {
  it('streams events that proxies must not compress or buffer', async () => {
    const response = await app.request('/api/v1/events', as('usr_laura'));
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: ready');
    await reader.cancel();
  });

  it('serves the OpenAPI document', async () => {
    const response = await app.request('/openapi.json');
    expect(response.status).toBe(200);
    const spec = (await response.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/invoices',
        '/api/v1/policy/preview',
        '/agent/v1/payment-requests',
      ]),
    );
  });

  it('uploads a bill and returns its receipt', async () => {
    const bill = findBill('ago-04');
    const form = new FormData();
    form.append(
      'file',
      new Blob([readFileSync(filePath(bill))], { type: 'application/pdf' }),
      basename(bill.file),
    );
    const upload = await app.request('/api/v1/invoices', {
      method: 'POST',
      body: form,
      headers: { 'x-mandato-user': 'usr_laura' },
    });
    expect(upload.status).toBe(201);
    const created = (await upload.json()) as { invoiceId: string; outcome: string };
    expect(created.outcome).toBe('PAY');

    const again = await app.request('/api/v1/invoices', {
      method: 'POST',
      body: (() => {
        const f = new FormData();
        f.append(
          'file',
          new Blob([readFileSync(filePath(bill))], { type: 'application/pdf' }),
          basename(bill.file),
        );
        return f;
      })(),
      headers: { 'x-mandato-user': 'usr_laura' },
    });
    expect(again.status).toBe(200); // same bytes → same bill, no second decision

    const detail = await app.request(`/api/v1/invoices/${created.invoiceId}`, as('usr_laura'));
    const body = (await detail.json()) as {
      decision: { results: unknown[]; summary: string };
      ledger: unknown[];
    };
    expect(body.decision.results).toHaveLength(23);
    expect(body.decision.summary).toMatch(/^Pagada sola/);
    expect(body.ledger.length).toBeGreaterThanOrEqual(3);

    const document = await app.request(
      `/api/v1/invoices/${created.invoiceId}/document`,
      as('usr_laura'),
    );
    expect(document.headers.get('content-type')).toBe('application/pdf');
    expect(document.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects unsupported uploads', async () => {
    const form = new FormData();
    form.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'factura.exe');
    const response = await app.request('/api/v1/invoices', {
      method: 'POST',
      body: form,
      headers: { 'x-mandato-user': 'usr_laura' },
    });
    expect(response.status).toBe(415);
  });

  it('accepts pasted chat messages and escalates what it cannot read', async () => {
    const response = await app.request(
      '/api/v1/invoices',
      as('usr_laura', {
        method: 'POST',
        body: JSON.stringify({ text: 'Hola, ¿me pagas lo de la semana pasada?', channel: 'chat' }),
      }),
    );
    const result = (await response.json()) as { outcome: string; summary: string };
    expect(result.outcome).toBe('ESCALATE');
    expect(result.summary).toContain('No pude leer el documento');
  });

  it('keeps policy changes for signers and previews them first', async () => {
    const terms = { ...INITIAL_POLICY, autonomousLimitUsdCents: 300_000 };
    const preview = await app.request(
      '/api/v1/policy/preview',
      as('usr_laura', { method: 'POST', body: JSON.stringify({ terms }) }),
    );
    const impact = (await preview.json()) as {
      evaluated: number;
      becomesEscalate: number;
      policyChanges: unknown[];
    };
    expect(impact.evaluated).toBeGreaterThan(0);
    expect(impact.becomesEscalate).toBeGreaterThan(0); // Valentina's USD 3,500 would now need approval
    expect(impact.policyChanges).toHaveLength(1);

    const denied = await app.request(
      '/api/v1/policy',
      as('usr_laura', { method: 'PUT', body: JSON.stringify({ terms }) }),
    );
    expect(denied.status).toBe(403);
    const saved = await app.request(
      '/api/v1/policy',
      as('usr_martin', { method: 'PUT', body: JSON.stringify({ terms, note: 'Prueba' }) }),
    );
    expect(((await saved.json()) as { version: number }).version).toBe(2);
  });

  it('validates request bodies', async () => {
    const response = await app.request(
      '/api/v1/policy/preview',
      as('usr_laura', {
        method: 'POST',
        body: JSON.stringify({ terms: { allowedCurrencies: [] } }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe('agent gateway', () => {
  const agent = (path: string, init: RequestInit = {}, key = agentKey) =>
    app.request(path, {
      ...init,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    });

  it('rejects unknown keys', async () => {
    expect((await agent('/agent/v1/budget', {}, 'nope')).status).toBe(401);
  });

  it('holds requests outside the agent scope and explains why', async () => {
    const response = await agent('/agent/v1/payment-requests', {
      method: 'POST',
      body: JSON.stringify({
        beneficiario: { nombre: 'Mateo Herrera Garza', id_fiscal: 'HEGM900101AB1', pais: 'MX' },
        numero_factura: 'F-AGT-1',
        fecha_emision: '2026-08-03',
        moneda: 'MXN',
        monto: '72000.00',
        concepto: 'Desarrollo backend',
        destino: { metodo: 'spei', valor: '012180001234567891' },
        categoria: 'contractor',
      }),
    });
    const view = (await response.json()) as {
      decision: string;
      resumen: string;
      reglas: { regla: string; resultado: string }[];
    };
    expect(view.decision).toBe('HOLD');
    expect(view.resumen).toContain('no tiene permiso para pagar contratistas');
  });

  it('lets the agent pay a software bill inside its scope and the signed mandate', async () => {
    const response = await agent('/agent/v1/payment-requests', {
      method: 'POST',
      body: JSON.stringify({
        beneficiario: { nombre: 'Tablero Software LLC', id_fiscal: 'EIN 87-7654321', pais: 'US' },
        numero_factura: 'TB-AGT-0801',
        fecha_emision: '2026-08-01',
        moneda: 'USD',
        monto: '504.00',
        concepto: 'Tablero Team plan — 42 seats (August 2026)',
        destino: { metodo: 'card', valor: '4421' },
        categoria: 'software',
        periodo_servicio: '2026-08',
      }),
    });
    const view = (await response.json()) as { decision: string; estado_legible: string };
    expect(view.decision).toBe('PAY');
    expect(view.estado_legible).toBe('pagada por el agente');

    const budget = (await (await agent('/agent/v1/budget')).json()) as { disponible_usd: number };
    expect(budget.disponible_usd).toBeLessThan(40_000);
    const payees = (await (await agent('/agent/v1/payees')).json()) as { destino: string }[];
    expect(payees.every((p) => !p.destino.includes('012180001234567891'))).toBe(true);
  });
});
