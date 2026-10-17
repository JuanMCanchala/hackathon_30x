import { serve } from '@hono/node-server';
import { loadConfig } from './config';
import { createContainer } from './container';
import { createApp } from './http/app';
import { isSeeded, resetDemo } from './services/demo';

async function main() {
  const config = loadConfig();
  const { deps, database } = await createContainer(config);
  if (config.DEMO_MODE && !(await isSeeded(deps))) {
    await resetDemo(deps);
    console.info('Demo: Andes Labs sembrada al 31 de julio de 2026.');
  }
  const app = createApp(deps);
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.info(
      `Mandato API en http://localhost:${info.port} · docs en /docs · base de datos ${database.kind} · lector ${deps.extractor.name}`,
    );
  });
  const shutdown = async () => {
    server.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
