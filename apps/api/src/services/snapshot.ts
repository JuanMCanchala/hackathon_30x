/**
 * The demo's frozen week: every table exported as gzipped JSON lines under SNAPSHOT_DIR, and
 * loaded into an empty database at startup. With the recorded model answers, the radar runs
 * exactly as captured, without network.
 */
import { createReadStream, existsSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip, gzipSync } from 'node:zlib';
import { eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { scrub } from '../pipeline/ingest';
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
  ['watches', schema.watches],
  ['watch_runs', schema.watchRuns],
  ['watch_hits', schema.watchHits],
];

const round4 = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x)) : v;

/** A topic's vectors only steer where new labels go: four decimals keep that and halve the file. */
const slim = (name: string, row: Record<string, unknown>) =>
  name === 'topics' ? { ...row, leader: round4(row.leader), centroid: round4(row.centroid) } : row;

export async function exportSnapshot(deps: Deps): Promise<Record<string, number>> {
  const dir = deps.config.SNAPSHOT_DIR;
  await mkdir(dir, { recursive: true });
  const counts: Record<string, number> = {};
  for (const [name, table] of TABLES) {
    const rows = await deps.db.select().from(table);
    counts[name] = rows.length;
    const text = rows.map((r) => JSON.stringify(slim(name, r))).join('\n');
    await writeFile(join(dir, `${name}.jsonl.gz`), gzipSync(text));
  }
  // The slides Vigía caught: Instagram's links expire, so the copies travel with the snapshot.
  const media = join(deps.config.DATA_DIR, 'media');
  if (existsSync(media)) await cp(media, join(dir, 'media'), { recursive: true });
  return counts;
}

/** Written last: a database holding pieces but no marker is an import a restart cut short. */
export const IMPORTED = { id: 'run_snapshot_import', kind: 'snapshot-import' };

/**
 * A gzipped JSON-lines file, one row at a time, so the whole file never sits in memory. Only a
 * line feed ends a row: JSON.stringify escapes it inside strings.
 */
async function* jsonLines(path: string): AsyncGenerator<Record<string, unknown>> {
  let rest = '';
  for await (const chunk of createReadStream(path).pipe(createGunzip()).setEncoding('utf8')) {
    const lines = (rest + (chunk as string)).split('\n');
    rest = lines.pop()!;
    for (const line of lines) if (line) yield JSON.parse(line) as Record<string, unknown>;
  }
  if (rest) yield JSON.parse(rest) as Record<string, unknown>;
}

/**
 * Loads the snapshot into a database with no pieces yet, or one whose import a restart cut short
 * (rows already there are kept). Returns how many rows it read.
 */
export async function importSnapshotIfEmpty(deps: Deps): Promise<number> {
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(schema.items);
  if ((row?.n ?? 0) > 0) {
    const [marker] = await deps.db
      .select({ id: schema.runs.id })
      .from(schema.runs)
      .where(eq(schema.runs.id, IMPORTED.id));
    // Pieces and no marker: an import a restart cut short, or a database older than the marker.
    // Finishing the import is harmless either way: rows already there win.
    if (marker) return 0;
  }
  const dir = deps.config.SNAPSHOT_DIR;
  if (!existsSync(join(dir, 'items.jsonl.gz'))) return 0;
  let total = 0;
  for (const [name, table] of TABLES) {
    const path = join(dir, `${name}.jsonl.gz`);
    if (!existsSync(path)) continue;
    let batch: Record<string, unknown>[] = [];
    const flush = async () => {
      if (batch.length)
        await deps.db
          .insert(table)
          .values(batch as never)
          .onConflictDoNothing();
      batch = [];
    };
    for await (const r of jsonLines(path)) {
      // A snapshot exported from an imported database carries the marker: it goes in last.
      if (name === 'runs' && r.id === IMPORTED.id) continue;
      // Snapshots exported before the email filter still carry contact emails in piece text.
      if (name === 'items') {
        if (typeof r.text === 'string') r.text = scrub(r.text);
        if (typeof r.title === 'string') r.title = scrub(r.title);
      }
      batch.push(r);
      total += 1;
      if (batch.length === 500) await flush();
    }
    await flush();
  }
  const media = join(dir, 'media');
  if (existsSync(media))
    await cp(media, join(deps.config.DATA_DIR, 'media'), { recursive: true, force: false });
  const now = deps.clock.now().toISOString();
  await deps.db
    .insert(schema.runs)
    .values({ ...IMPORTED, startedAt: now, finishedAt: now, stats: { rows: total } })
    .onConflictDoNothing();
  return total;
}
