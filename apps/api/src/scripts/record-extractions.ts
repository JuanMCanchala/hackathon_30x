/**
 * Records the language model's real readings of every dataset document (ADR-0010), with the
 * configured provider: Claude, or DeepSeek on Fireworks (ADR-0017). Keys come from .env.
 *
 *   pnpm extractions:record            # only missing ones
 *   pnpm extractions:record --force    # all of them
 *   pnpm extractions:record ago-04     # some of them
 *   RECORD_CONCURRENCY=1 pnpm extractions:record   # gentler on a busy provider
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ALL_BILLS, EXTRACTIONS_DIR, filePath, type DatasetBill } from '@mandato/dataset';
import { loadConfig, loadDotEnv } from '../config';
import { liveReader } from '../container';
import { ExtractionCache } from '../extraction/cache';
import { EXTRACTOR_VERSION } from '../extraction/types';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));
  loadDotEnv();
  const config = loadConfig();
  const configured = liveReader(config);
  if (!configured) {
    console.error('Falta ANTHROPIC_API_KEY o FIREWORKS_API_KEY.');
    process.exit(1);
  }
  const reader = configured;
  console.info(`Lector: ${reader.provider}`);
  const cache = new ExtractionCache(EXTRACTIONS_DIR);
  const bills = ids.length ? ALL_BILLS.filter((b) => ids.includes(b.id)) : ALL_BILLS;
  const queue = [...bills];
  let recorded = 0;
  let skipped = 0;
  const failures: string[] = [];

  async function worker() {
    for (let bill = queue.shift(); bill; bill = queue.shift()) await recordOne(bill);
  }

  async function recordOne(bill: DatasetBill) {
    const bytes = await readFile(filePath(bill));
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (!force && (await cache.get(sha))) {
      skipped++;
      return;
    }
    try {
      const input = {
        bytes,
        mediaType: bill.mediaType,
        filename: basename(bill.file),
        sha256: sha,
      };
      // Providers slow down under load: one retry before counting a document as failed.
      const result = await reader.read(input).catch(() => reader.read(input));
      await cache.put({
        sha256: sha,
        extractorVersion: EXTRACTOR_VERSION,
        provider: reader.provider,
        model: result.model,
        recordedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        file: bill.file,
        extraction: result.extraction,
        usage: result.usage,
      });
      recorded++;
      console.info(
        `✓ ${bill.id} (${result.latencyMs} ms, ${result.usage.inputTokens}→${result.usage.outputTokens} tokens)`,
      );
    } catch (error) {
      failures.push(bill.id);
      console.error(`✗ ${bill.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const concurrency = Math.max(1, Number(process.env.RECORD_CONCURRENCY ?? 3));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.info(`\nGrabadas ${recorded}, ya existían ${skipped}, fallaron ${failures.length}.`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
