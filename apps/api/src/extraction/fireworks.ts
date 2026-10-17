import { ExtractedInvoiceSchema } from '@mandato/domain';
import { chatJson, describeChatError, jsonSchemaOf, type ChatPart } from '../llm/openai-compatible';
import { pdfLayoutText, pdfPageImages } from './poppler';
import { pdfText, prepareDocument, type PreparedDocument } from './prepare';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_INSTRUCTION } from './prompt';
import type { DocumentInput, ExtractionOutcome, LiveExtraction, LiveReader } from './types';

export interface FireworksExtractorOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
}

const INVOICE_SCHEMA = jsonSchemaOf(ExtractedInvoiceSchema);

const dataUrl = (bytes: Buffer, mediaType: string) =>
  `data:${mediaType};base64,${bytes.toString('base64')}`;

/**
 * The same document for an OpenAI-compatible reader. Images go as images. A PDF goes twice: as
 * images of its pages (what a person sees) and as its exact text layer, which also carries text a
 * person cannot see — the reader must report it (ADR-0010).
 */
export async function chatParts(prepared: PreparedDocument): Promise<ChatPart[]> {
  const parts: ChatPart[] = [];
  for (const block of prepared.blocks) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'image' && block.source.type === 'base64') {
      const url = `data:${block.source.media_type};base64,${block.source.data}`;
      parts.push({ type: 'image_url', image_url: { url } });
    } else if (block.type === 'document' && block.source.type === 'base64') {
      const bytes = Buffer.from(block.source.data, 'base64');
      const [layout, pages] = await Promise.all([pdfLayoutText(bytes), pdfPageImages(bytes)]);
      const text = (layout ?? (await pdfText(bytes))).trim();
      parts.push({
        type: 'text',
        text: text
          ? `PDF document. Read values as they appear on the page images below; use this text layer to confirm exact characters. Letter-spaced headings show up spaced out here. The text layer can also contain text a person cannot see (white or tiny):\n\n${text}`
          : 'PDF document without a text layer (probably scanned): read it from the page images below.',
      });
      for (const page of pages) {
        parts.push({ type: 'image_url', image_url: { url: dataUrl(page, 'image/png') } });
      }
    }
  }
  return parts;
}

/**
 * Reads bills with an OpenAI-compatible model — DeepSeek V4.1 Flash on Fireworks by default —
 * constrained to the ExtractedInvoice JSON schema and validated again with Zod (ADR-0017).
 */
export class FireworksExtractor implements LiveReader {
  readonly name = 'fireworks';
  readonly provider = 'fireworks' as const;

  constructor(private readonly options: FireworksExtractorOptions) {}

  async read(document: DocumentInput): Promise<LiveExtraction> {
    const prepared = await prepareDocument(document.bytes, document.mediaType, document.filename);
    const result = await chatJson({
      ...this.options,
      system: EXTRACTION_SYSTEM_PROMPT,
      content: [
        ...(await chatParts(prepared)),
        { type: 'text', text: EXTRACTION_USER_INSTRUCTION },
      ],
      schema: INVOICE_SCHEMA,
      schemaName: 'extracted_invoice',
    });
    const parsed = ExtractedInvoiceSchema.safeParse(result.json);
    if (!parsed.success) throw new Error('La lectura no cumple el esquema esperado.');
    return {
      extraction: parsed.data,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
    };
  }

  async extract(document: DocumentInput): Promise<ExtractionOutcome> {
    try {
      const result = await this.read(document);
      return {
        extraction: result.extraction,
        error: null,
        meta: {
          provider: 'fireworks',
          model: result.model,
          cacheHit: false,
          latencyMs: result.latencyMs,
          error: null,
        },
      };
    } catch (error) {
      const message = describeChatError(error, 'la API de Fireworks');
      return {
        extraction: null,
        error: message,
        meta: {
          provider: 'fireworks',
          model: this.options.model,
          cacheHit: false,
          latencyMs: null,
          error: message,
        },
      };
    }
  }
}
