/**
 * Reading what `scripts/capture.mjs` saved: one directory per run under `data/raw/`, with an
 * `index.jsonl` that lists every request and the gzipped body of each one that answered.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { CaptureRecord } from './types';

/** Run directories (absolute paths), oldest first. A run is named by its start time. */
export async function listRuns(rawDir: string): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(rawDir);
  } catch {
    return [];
  }
  const runs: string[] = [];
  for (const name of names.sort()) {
    const dir = join(rawDir, name);
    try {
      if ((await stat(join(dir, 'index.jsonl'))).isFile()) runs.push(dir);
    } catch {
      // A directory without an index is not a run.
    }
  }
  return runs;
}

export async function latestRun(rawDir: string): Promise<string | undefined> {
  return (await listRuns(rawDir)).at(-1);
}

/** Every record of a run's index, including the requests that failed. */
export async function readIndex(runDir: string): Promise<CaptureRecord[]> {
  const text = await readFile(join(runDir, 'index.jsonl'), 'utf8');
  const records: CaptureRecord[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as CaptureRecord);
    } catch {
      // A line cut by a crash mid-write is skipped.
    }
  }
  return records;
}

/** The responses of a run that came back with a body, decompressed, in capture order. */
export async function* readRun(
  runDir: string,
): AsyncGenerator<{ record: CaptureRecord; body: string }> {
  for (const record of await readIndex(runDir)) {
    if (!record.file) continue;
    let body: string;
    try {
      body = gunzipSync(await readFile(join(runDir, record.file))).toString('utf8');
    } catch {
      continue;
    }
    yield { record, body };
  }
}
