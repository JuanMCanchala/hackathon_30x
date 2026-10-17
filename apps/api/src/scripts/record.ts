/**
 * Records the real model's answers for every dataset bill into packages/dataset/recordings: the
 * reading of each document, then the line matching against the contract the services would pick
 * (the vendor resolved from that reading, its contract active on the read issue date). Answers
 * already recorded for the current READER_VERSION / MATCHER_VERSION replay and cost nothing.
 * Prints each reading's differences from the truth and the tokens this run spent.
 *
 *   LLM_PROVIDER=openrouter wallenv run -- pnpm record
 *   RECORD_CONCURRENCY=3 ...                   # parallel requests (default 1, sequential)
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  BILLS,
  CONTRACTS,
  filesDir,
  recordingsDir,
  VENDORS,
  type BillSpec,
} from '@recibido/dataset';
import { activeContract, resolveVendor } from '@recibido/domain';
import { describeLlm, loadConfig } from '../config';
import { CachedLlm, LlmCache, type LlmRecord } from '../llm/cache';
import { documentText, sha256Hex } from '../reading/documents';
import { LineMatcher } from '../reading/matcher';
import { BillReader } from '../reading/reader';
import { readingErrors } from './reading-fields';

function recordedSince(startedAt: string): LlmRecord[] {
  return (['read', 'match'] as const).flatMap((kind) => {
    const dir = join(recordingsDir(), kind);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as LlmRecord)
      .filter((r) => r.recordedAt >= startedAt);
  });
}

async function main() {
  const config = loadConfig({ ...process.env, RECORD: 'true' });
  if (config.llm.provider === 'none') {
    console.error(
      'Sin modelo: define DEEPSEEK_API_KEY_PRINCIPAL u OPENROUTER_API_KEY (wallenv run).',
    );
    process.exit(1);
  }
  console.info(`Modelo: ${describeLlm(config.llm)}`);
  const llm = new CachedLlm(new LlmCache(recordingsDir()), config.llm, { record: true });
  const reader = new BillReader(llm);
  const matcher = new LineMatcher(llm);
  const startedAt = new Date().toISOString();
  const failures: string[] = [];

  async function recordOne(spec: BillSpec) {
    const bytes = readFileSync(join(filesDir(), spec.file));
    const filename = basename(spec.file);
    const { channel, text } = await documentText(bytes, filename);
    const read = await reader.read({ sha256: sha256Hex(bytes), filename, text, channel });
    if (!read.reading) {
      // a document without text is never sent to the model: the bill escalates as unreadable
      if (text.trim() === '') return void console.info(`· ${spec.id}: sin texto legible`);
      failures.push(`${spec.id}: ${read.error ?? 'sin lectura'}`);
      console.error(`✗ ${spec.id}: ${read.error ?? 'sin lectura'}`);
      return;
    }
    const errors = readingErrors(spec.truth, read.reading);
    const vendor = resolveVendor(read.reading, VENDORS);
    const contract = vendor && activeContract(vendor, CONTRACTS, read.reading.issueDate);
    let matched = 'sin contrato: no se cruza';
    if (contract) {
      const m = await matcher.match({ lines: read.reading.lines, contract });
      if (!m.matches) failures.push(`${spec.id} (cruce): ${m.error ?? 'sin respuesta'}`);
      matched = m.matches
        ? `cruce ${m.matches.map((x) => `${x.termId ?? '—'} ${x.confidence}`).join(', ')}`
        : `cruce falló: ${m.error}`;
    }
    console.info(
      `${errors.length ? '≠' : '✓'} ${spec.id} (${read.meta.cacheHit ? 'grabada' : 'nueva'}) · ${matched}${errors.length ? `\n    ${errors.join('\n    ')}` : ''}`,
    );
  }

  const queue = [...BILLS];
  const worker = async () => {
    for (let spec = queue.shift(); spec; spec = queue.shift()) {
      try {
        await recordOne(spec);
      } catch (error) {
        failures.push(`${spec.id}: ${String(error)}`);
        console.error(`✗ ${spec.id}: ${String(error)}`);
      }
    }
  };
  const concurrency = Math.max(1, Number(process.env.RECORD_CONCURRENCY ?? 1));
  await Promise.all(Array.from({ length: concurrency }, worker));

  const fresh = recordedSince(startedAt);
  const sum = (f: (r: LlmRecord) => number) => fresh.reduce((s, r) => s + f(r), 0);
  console.info(
    `\nGrabadas ahora: ${fresh.filter((r) => r.kind === 'read').length} lecturas y ${fresh.filter((r) => r.kind === 'match').length} cruces · ${sum((r) => r.usage.inputTokens)} tokens de entrada (${sum((r) => r.usage.cacheReadTokens)} en caché) · ${sum((r) => r.usage.outputTokens)} de salida.`,
  );
  if (failures.length) {
    console.error(`Fallaron ${failures.length}:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
