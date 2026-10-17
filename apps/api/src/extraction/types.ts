import type { ExtractedInvoice } from '@mandato/domain';
import type { ExtractionMeta } from '../db/schema';

/** Bumping this invalidates every recorded extraction (record/replay cache key, ADR-0010). */
export const EXTRACTOR_VERSION = 'mandato-extractor/2';

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

export interface LiveExtraction {
  extraction: ExtractedInvoice;
  model: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

/** A language model that reads documents live; its readings can be recorded and replayed. */
export interface LiveReader extends Extractor {
  readonly provider: 'claude' | 'fireworks';
  /** Reads or throws (with a Spanish message); extract() never throws. */
  read(document: DocumentInput): Promise<LiveExtraction>;
}

/** A recorded extraction, as stored in packages/dataset/extractions/<sha256>.json. */
export interface RecordedExtraction {
  sha256: string;
  extractorVersion: string;
  /** Who read it; recordings made before ADR-0017 were all Claude's. */
  provider?: LiveReader['provider'];
  model: string;
  recordedAt: string;
  latencyMs: number;
  file: string | null;
  extraction: ExtractedInvoice;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | null;
}
