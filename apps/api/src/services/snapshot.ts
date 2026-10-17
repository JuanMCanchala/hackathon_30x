/**
 * The demo's frozen week: every table exported as gzipped JSON lines under SNAPSHOT_DIR, and
 * loaded into an empty database at startup. With the recorded model answers, the radar runs
 * exactly as captured, without network.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import type { Deps } from './deps';

/** In dependency order: a table only references tables before it. */
const TABLES: [string, PgTable][] = [
  ['items', schema.items],
  ['item_metrics', schema.itemMetrics],
  ['enrichments', schema.enrichments],
  ['topics', schema.topics],
  ['topic_labels', schema.topicLabels],
  ['item_topics', schema.itemTopics],
  ['topic_series', schema.topicSeries],
  ['analyses', schema.analyses],
  ['adaptations', schema.adaptations],
  ['approvals', schema.approvals],
  ['sensor_submissions', schema.sensorSubmissions],
  ['runs', schema.runs],
  ['llm_usage', schema.llmUsage],
];

export async function exportSnapshot(deps: Deps): Promise<Record<string, number>> {
  const dir = deps.config.SNAPSHOT_DIR;
  await mkdir(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const [name, table] of TABLES) {
    const rows = await deps.db.select().from(table);
    counts[name] = rows.length;
    const text = rows.map((r) => JSON.stringify(r)).join('\n');
    await writeFile(join(dir, `${name}.jsonl.gz`), gzipSync(text));
  }
  return counts;
}

/** Loads the snapshot when the database has no pieces yet. Returns how many rows it loaded. */
export async function importSnapshotIfEmpty(deps: Deps): Promise<number> {
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(schema.items);
  if ((row?.n ?? 0) > 0) return 0;
  const dir = deps.config.SNAPSHOT_DIR;
  if (!existsSync(join(dir, 'items.jsonl.gz'))) return 0;
  let total = 0;
  for (const [name, table] of TABLES) {
    const path = join(dir, `${name}.jsonl.gz`);
    if (!existsSync(path)) continue;
    const text = gunzipSync(await readFile(path)).toString('utf8');
    const rows = text ? text.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];
    for (let i = 0; i < rows.length; i += 500) {
      await deps.db
        .insert(table)
        .values(rows.slice(i, i + 500) as never)
        .onConflictDoNothing();
    }
    total += rows.length;
  }
  return total;
}
