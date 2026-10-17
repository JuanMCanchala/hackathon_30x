/**
 * The whole pipeline from the command line: ingest new capture runs, read new pieces with the
 * model, cluster labels into topics and name the new ones.
 *
 *   pnpm --filter @radar/api radar [--skip-enrich] [--limit 3000]
 */
import { loadConfig, loadDotEnv } from '../config';
import { createContainer } from '../container';
import { clusterLabels, nameTopics } from '../pipeline/cluster';
import { enrichPending, enrichmentStats } from '../pipeline/enrich';
import { ingestRuns } from '../pipeline/ingest';

const args = process.argv.slice(2);
const limit = Number(args[args.indexOf('--limit') + 1] || 5000);

loadDotEnv();
const config = loadConfig();
const { deps, database } = await createContainer(config);
const t0 = Date.now();
const ingested = await ingestRuns(deps, { force: args.includes('--force') });
console.info(`ingesta: ${ingested.runs.length} corridas, ${ingested.items} piezas`);
if (!args.includes('--skip-enrich')) {
  let last = 0;
  const enriched = await enrichPending(deps, {
    limit,
    onProgress: (done, total) => {
      if (done - last >= 200 || done === total) {
        last = done;
        console.info(`  enriquecidas ${done}/${total}`);
      }
    },
  });
  console.info(`enriquecimiento: ${enriched.read} leídas, ${enriched.failed} fallidas`);
}
const stats = await enrichmentStats(deps);
console.info(`piezas leídas: ${stats.read}, de IA: ${stats.ai}`);
const clustered = await clusterLabels(deps);
console.info(`temas: ${clustered.newLabels} etiquetas nuevas, ${clustered.newTopics} temas nuevos`);
const named = await nameTopics(deps);
console.info(`nombres: ${named} temas nombrados`);
console.info(`listo en ${Math.round((Date.now() - t0) / 1000)} s`);
await database.close();
