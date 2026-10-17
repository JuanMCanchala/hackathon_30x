/**
 * Record and replay of language-model answers. Recordings live at
 * packages/dataset/recordings/<kind>/<key>.json, so the demo and the eval replay without a key.
 * The key is the SHA-256 of the stable JSON of { kind, version, ...input }.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { LlmConfig } from '../config';
import { chatJson, describeChatError, type Fetch, type Usage } from './client';

export type LlmKind = 'read' | 'match';

export interface LlmRecord {
  key: string;
  kind: LlmKind;
  version: string;
  model: string;
  provider: string;
  recordedAt: string;
  latencyMs: number;
  usage: Usage;
  /** what the key was computed from, plus anything that helps a person find the recording */
  input: unknown;
  output: unknown;
}

export interface LlmMeta {
  provider: string;
  model: string | null;
  cacheHit: boolean;
  latencyMs: number | null;
}

/** JSON with object keys sorted at every level. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export class LlmCache {
  constructor(readonly dir: string) {}

  key(kind: LlmKind, version: string, input: object): string {
    return createHash('sha256')
      .update(stableJson({ ...input, kind, version }))
      .digest('hex');
  }

  private path(kind: LlmKind, key: string): string {
    return join(this.dir, kind, `${key}.json`);
  }

  async get(kind: LlmKind, key: string): Promise<LlmRecord | null> {
    const file = this.path(kind, key);
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(await readFile(file, 'utf8')) as LlmRecord;
    } catch {
      return null; // a corrupt recording is a miss
    }
  }

  async put(kind: LlmKind, record: LlmRecord): Promise<void> {
    await mkdir(join(this.dir, kind), { recursive: true });
    await writeFile(this.path(kind, record.key), `${JSON.stringify(record, null, 2)}\n`);
  }
}

export interface LlmTask<T> {
  kind: LlmKind;
  version: string;
  /** exactly what the key is computed from */
  input: object;
  /** stored next to the input for people; not part of the key */
  note?: Record<string, unknown>;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  schemaHint: string;
}

export interface LlmOutcome<T> {
  output: T | null;
  error: string | null;
  meta: LlmMeta;
}

const MISSING: Record<LlmKind, string> = {
  read: 'sin lectura grabada y sin modelo configurado',
  match: 'sin cruce grabado y sin modelo configurado',
};

/**
 * Replay first; on a miss, call the model live when one is configured (and record the answer
 * when `record` is on). Without a recording and without a model the outcome is an error, which
 * the engine escalates (deny by default).
 */
export class CachedLlm {
  private readonly record: boolean;
  private readonly fetch: Fetch | undefined;

  constructor(
    private readonly cache: LlmCache,
    private readonly llm: LlmConfig,
    options: { record?: boolean; fetch?: Fetch } = {},
  ) {
    this.record = options.record ?? false;
    this.fetch = options.fetch;
  }

  async run<T>(task: LlmTask<T>): Promise<LlmOutcome<T>> {
    const key = this.cache.key(task.kind, task.version, task.input);
    const recorded = await this.cache.get(task.kind, key);
    const replay = recorded && task.schema.safeParse(recorded.output);
    if (recorded && replay?.success) {
      return {
        output: replay.data,
        error: null,
        meta: {
          provider: 'replay',
          model: recorded.model,
          cacheHit: true,
          latencyMs: recorded.latencyMs,
        },
      };
    }
    const { provider, apiKey, baseUrl, model } = this.llm;
    if (provider === 'none' || !apiKey) {
      return {
        output: null,
        error: MISSING[task.kind],
        meta: { provider: 'none', model: null, cacheHit: false, latencyMs: null },
      };
    }
    try {
      const result = await chatJson({
        baseUrl,
        apiKey,
        model,
        system: task.system,
        user: task.user,
        schema: task.schema,
        schemaHint: task.schemaHint,
        fetch: this.fetch,
      });
      if (this.record) {
        await this.cache.put(task.kind, {
          key,
          kind: task.kind,
          version: task.version,
          model: result.model,
          provider,
          recordedAt: new Date().toISOString(),
          latencyMs: result.latencyMs,
          usage: result.usage,
          input: { ...task.input, ...task.note },
          output: result.json,
        });
      }
      return {
        output: result.json,
        error: null,
        meta: { provider, model: result.model, cacheHit: false, latencyMs: result.latencyMs },
      };
    } catch (error) {
      return {
        output: null,
        error: describeChatError(error, provider === 'deepseek' ? 'DeepSeek' : 'OpenRouter'),
        meta: { provider, model, cacheHit: false, latencyMs: null },
      };
    }
  }
}
