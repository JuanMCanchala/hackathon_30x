/**
 * Parses one capture run and prints how many pieces each source gave, plus a sample of each.
 *
 *   pnpm --filter @radar/sources exec tsx scripts/inspect-run.ts [run-dir] [--samples]
 */
import { join } from 'node:path';
import { latestRun, parseRecord, readIndex, readRun } from '../src';

const ROOT = join(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const runDir = args.find((a) => !a.startsWith('--')) ?? (await latestRun(join(ROOT, 'data/raw')));
if (!runDir) {
  console.error('No capture runs under data/raw.');
  process.exit(1);
}

const index = await readIndex(runDir);
const perGroup = new Map<string, { requests: number; answered: number; items: number }>();
for (const r of index) {
  const g = perGroup.get(r.source) ?? { requests: 0, answered: 0, items: 0 };
  g.requests += 1;
  if (r.file) g.answered += 1;
  perGroup.set(r.source, g);
}

const perPlatform = new Map<string, number>();
const samples = new Map<string, unknown>();
const seen = new Set<string>();
for await (const { record, body } of readRun(runDir)) {
  const items = parseRecord(body, record);
  perGroup.get(record.source)!.items += items.length;
  for (const item of items) {
    const key = `${item.platform}:${item.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    perPlatform.set(item.platform, (perPlatform.get(item.platform) ?? 0) + 1);
    if (!samples.has(item.source)) samples.set(item.source, item);
  }
}

console.log(`Run ${runDir}`);
console.log('\nBy capture group (requests answered, pieces before dedupe):');
for (const [group, g] of [...perGroup].sort()) {
  console.log(`  ${group.padEnd(12)} ${g.answered}/${g.requests} answered, ${g.items} pieces`);
}
console.log('\nBy platform (unique pieces):');
for (const [platform, n] of [...perPlatform].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${platform.padEnd(12)} ${n}`);
}
console.log(`  ${'total'.padEnd(12)} ${seen.size}`);
if (args.includes('--samples')) {
  for (const [source, item] of samples) {
    console.log(`\n--- ${source}\n${JSON.stringify(item, null, 1).slice(0, 900)}`);
  }
}
