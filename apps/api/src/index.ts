import { serve } from '@hono/node-server';
import { loadConfig, loadDotEnv } from './config';
import { createContainer } from './container';
import { createApp } from './http/app';
import { importSnapshotIfEmpty } from './services/snapshot';
import { startWatchScheduler, watchSchedulerEnabled } from './services/watch';

// A connection to a provider that times out can surface from undici as an 'error' event nobody
// listens to («socket idle timeout» on an HTTP/2 stream). The request that used it already
// failed and is retried; it must not take the whole server down.
process.on('uncaughtException', (error) => {
  if ((error as { code?: string }).code?.startsWith('UND_ERR')) {
    console.error('red:', error.message);
    return;
  }
  console.error(error);
  process.exit(1);
});

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
  const stopWatches = watchSchedulerEnabled(config) ? startWatchScheduler(deps) : () => undefined;
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
