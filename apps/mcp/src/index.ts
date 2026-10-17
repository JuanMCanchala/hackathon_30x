/**
 * Mandato MCP server (stdio). Example for Claude Code:
 *
 *   claude mcp add mandato --env MANDATO_API_URL=http://localhost:4000 \
 *     --env MANDATO_AGENT_KEY=mnd_demo_agente_compras_2026 -- pnpm --dir apps/mcp dev
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MandatoClient } from './client';
import { createMandatoServer } from './server';

const baseUrl = process.env.MANDATO_API_URL ?? 'http://localhost:4000';
const agentKey = process.env.MANDATO_AGENT_KEY;
if (!agentKey) {
  console.error('Falta MANDATO_AGENT_KEY (API key del agente en Mandato).');
  process.exit(1);
}

const server = createMandatoServer(new MandatoClient({ baseUrl, agentKey }));
await server.connect(new StdioServerTransport());
console.error(`Mandato MCP conectado a ${baseUrl}`);
