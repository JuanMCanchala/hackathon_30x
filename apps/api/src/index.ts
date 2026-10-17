import { serve } from '@hono/node-server';
import { loadConfig, loadDotEnv } from './config';
import { createContainer } from './container';
import { createApp } from './http/app';
import { importSnapshotIfEmpty } from './services/snapshot';
import { startWatchScheduler } from './services/watch';

async function main() {
  loadDotEnv();
  const config = loadConfig();
  const { deps, database } = await createContainer(config);
  if (config.DEMO_MODE) {
    const imported = await importSnapshotIfEmpty(deps);
    if (imported)
      console.info(`Demo: base cargada desde ${config.SNAPSHOT_DIR} (${imported} filas).`);
  }
  const app = createApp(deps);
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    console.info(
      `Radar API en http://localhost:${info.port}, base de datos ${database.kind}, modelo ${config.LLM_MODE === 'replay' ? 'solo respuestas grabadas' : 'grabado y en vivo'}`,
    );
  });
  // Followed topics search again when their turn comes, while the API runs.
  const stopWatches = startWatchScheduler(deps);
  const shutdown = async () => {
    stopWatches();
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
