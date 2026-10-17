/** The API server: config from the environment, the database, the demo on first start, polling. */
import { serve } from '@hono/node-server';
import { describeLlm, loadConfig } from './config';
import { createContainer } from './container';
import { vendors } from './db/schema';
import { createApp } from './http/app';
import { DemoService } from './services/demo';

async function main() {
  const config = loadConfig();
  const c = await createContainer(config);
  const demo = config.demoMode ? new DemoService(c) : null;
  const [seeded] = await c.db.select({ id: vendors.id }).from(vendors).limit(1);
  if (!seeded) {
    if (demo) {
      await demo.reset();
      const problems = (await demo.tourState()).problems.length;
      console.info(
        `Demo: Altamar Labs ready at October 1, 2026${problems ? ` (${problems} steps skipped)` : ''}.`,
      );
    } else await c.seed();
  }
  if (config.github.repo) c.github.startPolling(config.github.pollMs);
  const server = serve({ fetch: createApp(c, demo).fetch, port: config.port }, ({ port }) => {
    console.info(
      `Recibido API on http://localhost:${port} · docs at /docs · ${config.databaseUrl ? 'postgres' : 'pglite'} · LLM ${describeLlm(config.llm)} · reader ${config.reader}`,
    );
  });
  const shutdown = async () => {
    server.close();
    await c.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
