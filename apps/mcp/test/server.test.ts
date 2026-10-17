import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { RadarClient } from '../src/client';
import { createRadarServer } from '../src/server';

const week = {
  headline: 'Esta semana crecen Sora 2 y los agentes que venden.',
  week: { start: '2026-10-10T00:00:00Z', end: '2026-10-17T00:00:00Z' },
  topics: [
    {
      id: 't_1',
      rank: 1,
      name: 'Sora 2',
      stage: 'emergente',
      timing: 'Entra ya',
      growthPct: 240,
      creators: 31,
      platforms: ['bluesky', 'youtube'],
      fit: 8,
      why: 'OpenAI abrió Sora 2 en la web.',
    },
  ],
  forming: [],
};

function fakeFetch(): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(url.toString());
    if (u.pathname === '/api/v1/radar') return new Response(JSON.stringify(week));
    if (u.pathname === '/api/v1/sensor' && init?.method === 'POST')
      return new Response(JSON.stringify({ error: { message: 'Ese enlace no es válido.' } }), {
        status: 400,
      });
    return new Response(JSON.stringify({ error: { message: 'No existe' } }), { status: 404 });
  }) as typeof fetch;
}

async function connect() {
  const server = createRadarServer(
    new RadarClient({ baseUrl: 'http://radar.test', fetch: fakeFetch() }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('Radar MCP', () => {
  it('lists the tools an assistant can use, and none that publishes', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'como_contarlo',
      'mandar_al_radar',
      'preguntar_al_radar',
      'radar_semana',
      'tema',
    ]);
  });

  it('answers the week with stage, growth, timing and the topic id', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'radar_semana', arguments: {} });
    const out = (result.content as { text: string }[])[0]!.text;
    expect(out).toContain('Sora 2 (id t_1): emergente, +240 % frente a su promedio');
    expect(out).toContain('Momento: Entra ya');
  });

  it('reports a refused post as an error the assistant can read', async () => {
    const client = await connect();
    const result = await client.callTool({
      name: 'mandar_al_radar',
      arguments: { url: 'https://example.com/x' },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toContain('Ese enlace no es válido');
  });
});
