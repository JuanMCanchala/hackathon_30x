import { ExtractedBillSchema, type ExtractedBill } from '@recibido/domain';
import type { CachedLlm, LlmMeta } from '../llm/cache';
import type { DocumentChannel } from './documents';
import { READER_EXAMPLE, READER_SYSTEM, readerUser } from './prompt';

/** Bump when the prompt or the schema changes: old recordings stop replaying. */
export const READER_VERSION = 'reader-1';

export interface ReadDocument {
  sha256: string;
  filename: string;
  text: string;
  channel: DocumentChannel;
}

export interface ReadResult {
  reading: ExtractedBill | null;
  error: string | null;
  meta: LlmMeta;
}

export interface Reader {
  read(doc: ReadDocument): Promise<ReadResult>;
}

export class BillReader implements Reader {
  constructor(private readonly llm: CachedLlm) {}

  async read(doc: ReadDocument): Promise<ReadResult> {
    // Nothing to read: never ask the model to imagine a bill.
    if (doc.text.trim() === '') {
      return {
        reading: null,
        error: 'documento sin texto legible',
        meta: { provider: 'none', model: null, cacheHit: false, latencyMs: null },
      };
    }
    const { output, error, meta } = await this.llm.run({
      kind: 'read',
      version: READER_VERSION,
      input: { sha256: doc.sha256 },
      note: { filename: doc.filename, channel: doc.channel },
      system: READER_SYSTEM,
      user: readerUser(doc),
      schema: ExtractedBillSchema,
      schemaHint: READER_EXAMPLE,
    });
    return { reading: output, error, meta };
  }
}
