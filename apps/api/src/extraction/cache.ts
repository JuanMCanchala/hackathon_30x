/**
 * Record/replay of extractions (ADR-0010): recorded readings live in
 * packages/dataset/extractions/<sha256>.json so anyone can replay the exact end-to-end
 * evaluation without an API key.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExtractedInvoiceSchema } from '@mandato/domain';
import {
  EXTRACTOR_VERSION,
  type DocumentInput,
  type ExtractionOutcome,
  type Extractor,
  type LiveReader,
  type RecordedExtraction,
} from './types';

export class ExtractionCache {
  constructor(private readonly dir: string) {}

  path(sha256: string): string {
    return join(this.dir, `${sha256}.json`);
  }

  async get(sha256: string): Promise<RecordedExtraction | null> {
    const file = this.path(sha256);
    if (!existsSync(file)) return null;
    const record = JSON.parse(await readFile(file, 'utf8')) as RecordedExtraction;
    if (record.extractorVersion !== EXTRACTOR_VERSION) return null;
    const parsed = ExtractedInvoiceSchema.safeParse(record.extraction);
    return parsed.success ? { ...record, extraction: parsed.data } : null;
  }

  async put(record: RecordedExtraction): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.path(record.sha256), `${JSON.stringify(record, null, 2)}\n`);
  }
}

/**
 * Serves recorded extractions; falls back to a live reader when one is configured.
 * Without a recording and without a live reader the document is reported unreadable, which the
 * engine escalates (deny-by-default).
 */
export class CachedExtractor implements Extractor {
  readonly name: string;

  constructor(
    private readonly cache: ExtractionCache,
    private readonly live: LiveReader | null,
    private readonly record = false,
  ) {
    this.name = live ? `${live.name}+replay` : 'replay';
  }

  async extract(document: DocumentInput): Promise<ExtractionOutcome> {
    const recorded = await this.cache.get(document.sha256);
    if (recorded) {
      return {
        extraction: recorded.extraction,
        error: null,
        meta: {
          provider: 'replay',
          model: recorded.model,
          cacheHit: true,
          latencyMs: recorded.latencyMs,
          error: null,
        },
      };
    }
    if (!this.live) {
      const error =
        'no hay una lectura grabada para este archivo y no hay un modelo de lenguaje configurado';
      return {
        extraction: null,
        error,
        meta: { provider: 'none', model: null, cacheHit: false, latencyMs: null, error },
      };
    }
    if (!this.record) return this.live.extract(document);
    const result = await this.live.read(document);
    await this.cache.put({
      sha256: document.sha256,
      extractorVersion: EXTRACTOR_VERSION,
      provider: this.live.provider,
      model: result.model,
      recordedAt: new Date().toISOString(),
      latencyMs: result.latencyMs,
      file: document.filename,
      extraction: result.extraction,
      usage: result.usage,
    });
    return {
      extraction: result.extraction,
      error: null,
      meta: {
        provider: this.live.provider,
        model: result.model,
        cacheHit: false,
        latencyMs: result.latencyMs,
        error: null,
      },
    };
  }
}
