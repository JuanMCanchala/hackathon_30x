/**
 * Text embeddings for topic labels (multilingual, so "agentes de IA para ventas" and "AI sales
 * agents" land together). Vectors are cached on disk by the hash of model and text; only labels
 * never seen before reach the API, in batches.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { sha256 } from '../lib/common';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingModel {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Matryoshka truncation: 512 keeps quality for short labels at a fraction of the size. */
  dimensions: number;
}

const BATCH = 64;

export class CachedEmbedder implements Embedder {
  private cache: Map<string, number[]> | null = null;

  constructor(
    private readonly file: string,
    private readonly live: EmbeddingModel | null,
    private readonly modelName: string,
  ) {}

  private keyOf(text: string): string {
    return sha256(`${this.modelName}\n${text}`);
  }

  private async load(): Promise<Map<string, number[]>> {
    if (this.cache) return this.cache;
    const cache = new Map<string, number[]>();
    if (existsSync(this.file)) {
      for (const line of (await readFile(this.file, 'utf8')).split('\n')) {
        if (!line) continue;
        const { k, v } = JSON.parse(line) as { k: string; v: number[] };
        cache.set(k, v);
      }
    }
    this.cache = cache;
    return cache;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const cache = await this.load();
    const missing = [...new Set(texts.filter((t) => !cache.has(this.keyOf(t))))];
    if (missing.length) {
      if (!this.live) throw new Error(`Faltan ${missing.length} embeddings y no hay modelo.`);
      await mkdir(dirname(this.file), { recursive: true });
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        const vectors = await this.request(batch);
        const lines = batch.map((text, j) => {
          const k = this.keyOf(text);
          const v = vectors[j]!.map((x) => Math.round(x * 1e5) / 1e5);
          cache.set(k, v);
          return JSON.stringify({ k, v });
        });
        await appendFile(this.file, `${lines.join('\n')}\n`);
      }
    }
    return texts.map((t) => cache.get(this.keyOf(t))!);
  }

  private async request(input: string[]): Promise<number[][]> {
    const live = this.live!;
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(`${live.baseUrl.replace(/\/$/, '')}/embeddings`, {
        method: 'POST',
        headers: { authorization: `Bearer ${live.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: live.model, input, dimensions: live.dimensions }),
        signal: AbortSignal.timeout(120_000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
        continue;
      }
      const body = (await response.json()) as {
        data?: { index: number; embedding: number[] }[];
        error?: unknown;
      };
      if (!response.ok || !body.data) {
        throw new Error(
          `Embeddings HTTP ${response.status}: ${JSON.stringify(body.error ?? body)}`,
        );
      }
      return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
  }
}
