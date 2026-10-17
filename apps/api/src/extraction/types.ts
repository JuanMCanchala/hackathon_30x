import type { ExtractedInvoice } from '@mandato/domain';
import type { ExtractionMeta } from '../db/schema';

/** Bumping this invalidates every recorded extraction (record/replay cache key, ADR-0010). */
export const EXTRACTOR_VERSION = 'mandato-extractor/1';

export interface DocumentInput {
  bytes: Buffer;
  mediaType: string;
  filename: string;
  sha256: string;
}

export interface ExtractionOutcome {
  extraction: ExtractedInvoice | null;
  /** Why there is no extraction (unreadable, no recording, API error…), in Spanish. */
  error: string | null;
  meta: Omit<ExtractionMeta, 'scanPhrases'>;
}

/** Port: turns a document into a typed extraction. Never decides anything (ADR-0002). */
export interface Extractor {
  readonly name: string;
  extract(document: DocumentInput): Promise<ExtractionOutcome>;
}

/** A recorded extraction, as stored in packages/dataset/extractions/<sha256>.json. */
export interface RecordedExtraction {
  sha256: string;
  extractorVersion: string;
  model: string;
  recordedAt: string;
  latencyMs: number;
  file: string | null;
  extraction: ExtractedInvoice;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
}
