import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { MandatoClient } from '../src/client';
import { createMandatoServer } from '../src/server';

function fakeFetch(responses: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url.toString()).pathname;
    const key = `${init?.method ?? 'GET'} ${path}`;
    const auth = new Headers(init?.headers).get('authorization');
    if (auth !== 'Bearer test-key')
      return new Response(JSON.stringify({ error: { message: 'API key inválida' } }), {
        status: 401,
      });
    const body = responses[key];
    return body === undefined
      ? new Response(JSON.stringify({ error: { message: 'No existe' } }), { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

async function connect(fetchImpl: typeof fetch, key = 'test-key') {
  const server = createMandatoServer(
    new MandatoClient({ baseUrl: 'http://mandato.test', agentKey: key, fetch: fetchImpl }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const escalated = {
  id: 'inv_1',
  referencia: 'MND-0042',
  decision: 'ESCALATE',
  estado_legible: 'pendiente de aprobación humana',
  resumen: 'Necesita aprobación. USD 1.200,00 supera el permiso del agente.',
  que_falto: ['la solicitud fuera de máximo USD 1.000,00 o la hiciera una persona'],
  aprobaciones_requeridas: 1,
  ver_en: 'http://localhost:3000/facturas/inv_1',
};

describe('Mandato MCP server', () => {
  it('exposes request and read tools only — never approve or sign', async () => {
    const client = await connect(fakeFetch({}));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'consultar_solicitud',
      'listar_beneficiarios',
      'solicitar_pago',
      'ver_presupuesto',
    ]);
  });

  it('returns the receipt and tells the agent a person must approve', async () => {
    const client = await connect(fakeFetch({ 'POST /agent/v1/payment-requests': escalated }));
    const result = await client.callTool({
      name: 'solicitar_pago',
      arguments: {
        beneficiario: { nombre: 'Tablero Software LLC' },
        numero_factura: 'TB-1',
        fecha_emision: '2026-10-01',
        moneda: 'USD',
        monto: '1200.00',
        concepto: 'Plan anual',
      },
    });
    const [content] = result.content as { type: string; text: string }[];
    expect(content?.text).toContain('MND-0042: pendiente de aprobación humana.');
    expect(content?.text).toContain('No la apruebes ni insistas');
    expect(content?.text).toContain('Se habría pagado sola si:');
  });

  it('surfaces gateway errors as tool errors', async () => {
    const client = await connect(fakeFetch({}), 'wrong-key');
    const result = await client.callTool({ name: 'ver_presupuesto', arguments: {} });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]?.text).toContain('API key inválida');
  });
});
