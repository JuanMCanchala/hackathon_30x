/**
 * Radar 30X MCP server (stdio). Example for Claude Code:
 *
 *   claude mcp add radar-30x --env RADAR_API_URL=http://localhost:4100 -- pnpm --dir apps/mcp dev
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RadarClient } from './client';
import { createRadarServer } from './server';

const baseUrl = process.env.RADAR_API_URL ?? 'http://localhost:4100';
const server = createRadarServer(new RadarClient({ baseUrl }));
await server.connect(new StdioServerTransport());
console.error(`Radar 30X MCP conectado a ${baseUrl}`);
