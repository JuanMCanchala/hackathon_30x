/** Placeholder server: health only. The full HTTP API arrives with the routes. */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { describeLlm, loadConfig } from './config';

const config = loadConfig();

export const app = new Hono().get('/api/v1/health', (c) =>
  c.json({ ok: true, llm: config.llm.provider, reader: config.reader }),
);

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.info(`Recibido API on http://localhost:${port} · LLM ${describeLlm(config.llm)}`);
});
