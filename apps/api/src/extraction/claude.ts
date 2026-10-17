import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ExtractedInvoiceSchema } from '@mandato/domain';
import { prepareDocument } from './prepare';
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_USER_INSTRUCTION } from './prompt';
import type { DocumentInput, ExtractionOutcome, LiveExtraction, LiveReader } from './types';

export interface ClaudeExtractorOptions {
  apiKey?: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
}

/**
 * Reads bills with Claude using structured outputs: the response is constrained to the
 * ExtractedInvoice JSON schema and validated again with Zod on our side.
 */
export class ClaudeExtractor implements LiveReader {
  readonly name = 'claude';
  readonly provider = 'claude' as const;
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeExtractorOptions) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
  }

  async read(document: DocumentInput): Promise<LiveExtraction> {
    const prepared = await prepareDocument(document.bytes, document.mediaType, document.filename);
    const started = Date.now();
    const response = await this.client.beta.messages.parse({
      model: this.options.model,
      max_tokens: 16000,
      // Server-side fallback if the model declines for policy reasons.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: EXTRACTION_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        {
          role: 'user',
          content: [...prepared.blocks, { type: 'text', text: EXTRACTION_USER_INSTRUCTION }],
        },
      ],
      output_config: {
        effort: this.options.effort,
        format: betaZodOutputFormat(ExtractedInvoiceSchema),
      },
    });
    if (response.stop_reason === 'refusal') {
      throw new Error('El modelo se negó a leer el documento.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('La lectura quedó incompleta (límite de tokens).');
    }
    const parsed = ExtractedInvoiceSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      throw new Error('La lectura no cumple el esquema esperado.');
    }
    return {
      extraction: parsed.data,
      model: response.model,
      latencyMs: Date.now() - started,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }

  async extract(document: DocumentInput): Promise<ExtractionOutcome> {
    try {
      const result = await this.read(document);
      return {
        extraction: result.extraction,
        error: null,
        meta: {
          provider: 'claude',
          model: result.model,
          cacheHit: false,
          latencyMs: result.latencyMs,
          error: null,
        },
      };
    } catch (error) {
      const message = describeError(error);
      return {
        extraction: null,
        error: message,
        meta: {
          provider: 'claude',
          model: this.options.model,
          cacheHit: false,
          latencyMs: null,
          error: message,
        },
      };
    }
  }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError)
    return 'la API de Claude rechazó la credencial';
  if (error instanceof Anthropic.RateLimitError)
    return 'la API de Claude está saturada; intenta de nuevo';
  if (error instanceof Anthropic.BadRequestError)
    return `la API de Claude rechazó el documento (${error.message})`;
  if (error instanceof Anthropic.APIError)
    return `error de la API de Claude (${error.status ?? 'sin estado'})`;
  if (error instanceof Error) return error.message;
  return 'error desconocido al leer el documento';
}
