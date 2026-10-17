/**
 * Perfect reader for the evaluation harness's engine-only run: returns the dataset's ground
 * truth for known files. It isolates the decision logic from reading mistakes; it is never
 * used to serve real uploads.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ALL_BILLS, filePath } from '@mandato/dataset';
import type { ExtractedInvoice } from '@mandato/domain';
import type { DocumentInput, ExtractionOutcome, Extractor } from './types';

export class GroundTruthExtractor implements Extractor {
  readonly name = 'ground-truth';
  private readonly bySha = new Map<string, ExtractedInvoice>();

  constructor() {
    for (const bill of ALL_BILLS) {
      const sha = createHash('sha256')
        .update(readFileSync(filePath(bill)))
        .digest('hex');
      this.bySha.set(sha, bill.truth);
    }
  }

  async extract(document: DocumentInput): Promise<ExtractionOutcome> {
    const truth = this.bySha.get(document.sha256);
    if (!truth) {
      const error = 'el lector de referencia solo conoce los archivos del set de datos';
      return {
        extraction: null,
        error,
        meta: { provider: 'none', model: null, cacheHit: false, latencyMs: null, error },
      };
    }
    return {
      extraction: structuredClone(truth),
      error: null,
      meta: { provider: 'ground-truth', model: null, cacheHit: true, latencyMs: 0, error: null },
    };
  }
}
