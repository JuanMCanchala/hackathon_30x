/**
 * Records Claude's real extractions of every dataset document (ADR-0010):
 *
 *   ANTHROPIC_API_KEY=… pnpm extractions:record            # only missing ones
 *   ANTHROPIC_API_KEY=… pnpm extractions:record --force    # all of them
 *   ANTHROPIC_API_KEY=… pnpm extractions:record ago-04     # some of them
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ALL_BILLS, EXTRACTIONS_DIR, filePath, type DatasetBill } from '@mandato/dataset';
import { loadConfig } from '../config';
import { ExtractionCache } from '../extraction/cache';
import { ClaudeExtractor } from '../extraction/claude';
import { EXTRACTOR_VERSION } from '../extraction/types';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));
  const config = loadConfig();
  if (!config.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY.');
    process.exit(1);
  }
  const reader = new ClaudeExtractor({
    apiKey: config.ANTHROPIC_API_KEY,
    model: config.EXTRACTION_MODEL,
    effort: config.EXTRACTION_EFFORT,
  });
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
      const result = await reader.read({
        bytes,
        mediaType: bill.mediaType,
        filename: basename(bill.file),
        sha256: sha,
      });
      await cache.put({
        sha256: sha,
        extractorVersion: EXTRACTOR_VERSION,
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

  await Promise.all([worker(), worker(), worker()]);
  console.info(`\nGrabadas ${recorded}, ya existían ${skipped}, fallaron ${failures.length}.`);
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
