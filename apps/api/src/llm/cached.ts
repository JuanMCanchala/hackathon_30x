/**
 * The language model behind a recording. Every answer is saved under LLM_CACHE_DIR, keyed by the
 * hash of what was asked, so the demo, the tests and CI replay the same answers without network,
 * and the live model is called only for questions it was never asked. Replays still report what
 * the answer cost when it was recorded, so the cost of the week stays honest.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ZodError, type z } from 'zod';
import { AppError, sha256 } from '../lib/common';
import { chatJson, describeChatError, jsonSchemaOf } from './openai-compatible';
import type { StructuredLlm } from './structured';

/** USD per million tokens, DeepSeek V4.1 Flash on Fireworks (third-party trackers, Oct 2026). */
export const LLM_PRICE = { input: 0.22, output: 0.66 } as const;

export const costOf = (inputTokens: number, outputTokens: number) =>
  (inputTokens * LLM_PRICE.input + outputTokens * LLM_PRICE.output) / 1_000_000;

export interface LlmUsage {
  name: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  replayed: boolean;
}

interface Recording {
  key: string;
  name: string;
  model: string;
  recordedAt: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
  output: unknown;
}

export interface LiveModel {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface RecordedRequest<T extends z.ZodType> {
  system: string;
  user: string;
  schema: T;
  /** Groups recordings on disk and names the JSON schema: enrich, name-topics, adapt… */
  name: string;
  maxTokens?: number;
  /** 0 is the canonical answer; 1, 2… are "otra versión", asked with some temperature. */
  variant?: number;
  /** `none` for labeling and naming: fast, cheap, and the model needs no reasoning there. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

/** What services need from the language model: one typed answer per request. */
export interface Llm {
  complete<T extends z.ZodType>(request: RecordedRequest<T>): Promise<z.infer<T>>;
}

export class RecordedLlm implements StructuredLlm, Llm {
  constructor(
    private readonly options: {
      dir: string;
      live: LiveModel | null;
      /** `replay` never calls the live model. */
      mode: 'auto' | 'replay';
      onUsage?: (usage: LlmUsage) => void | Promise<void>;
    },
  ) {}

  keyOf(request: Pick<RecordedRequest<z.ZodType>, 'name' | 'system' | 'user' | 'variant'>): string {
    return sha256(
      JSON.stringify([request.name, request.system, request.user, request.variant ?? 0]),
    );
  }

  private pathOf(name: string, key: string): string {
    return join(this.options.dir, name, key.slice(0, 2), `${key}.json`);
  }

  /** Whether an answer for this request is already recorded. */
  has(request: Pick<RecordedRequest<z.ZodType>, 'name' | 'system' | 'user' | 'variant'>): boolean {
    return existsSync(this.pathOf(request.name, this.keyOf(request)));
  }

  async complete<T extends z.ZodType>(request: RecordedRequest<T>): Promise<z.infer<T>> {
    const key = this.keyOf(request);
    const path = this.pathOf(request.name, key);
    if (existsSync(path)) {
      const recording = JSON.parse(await readFile(path, 'utf8')) as Recording;
      await this.options.onUsage?.({
        name: request.name,
        model: recording.model,
        ...recording.usage,
        costUsd: costOf(recording.usage.inputTokens, recording.usage.outputTokens),
        replayed: true,
      });
      return request.schema.parse(recording.output);
    }
    const live = this.options.live;
    if (!live || this.options.mode === 'replay') {
      throw new AppError(
        503,
        'llm_unavailable',
        'Esta respuesta no está grabada y el modelo no está disponible en este modo.',
      );
    }
    try {
      const result = await chatJson({
        baseUrl: live.baseUrl,
        apiKey: live.apiKey,
        model: live.model,
        system: request.system,
        content: [{ type: 'text', text: request.user }],
        schema: jsonSchemaOf(request.schema),
        schemaName: request.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
        maxTokens: request.maxTokens ?? 8000,
        temperature: request.variant ? 0.8 : 0,
        reasoningEffort: request.reasoningEffort,
      });
      const output = request.schema.parse(result.json);
      const recording: Recording = {
        key,
        name: request.name,
        model: result.model,
        recordedAt: new Date().toISOString(),
        latencyMs: result.latencyMs,
        usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
        output,
      };
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(recording, null, 1)}\n`);
      await this.options.onUsage?.({
        name: request.name,
        model: result.model,
        ...recording.usage,
        costUsd: costOf(recording.usage.inputTokens, recording.usage.outputTokens),
        replayed: false,
      });
      return output;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error(error);
      const reason =
        error instanceof ZodError
          ? 'la respuesta no tuvo el formato esperado'
          : describeChatError(error, 'el servicio de redacción');
      throw new AppError(
        503,
        'llm_unavailable',
        `El asistente no pudo responder ahora: ${reason}. Intenta de nuevo en unos segundos.`,
      );
    }
  }
}
