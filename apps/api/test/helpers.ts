import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config';
import { createContainer } from '../src/container';
import type { Clock } from '../src/lib/common';
import { RecordedLlm } from '../src/llm/cached';
import type { Embedder } from '../src/llm/embeddings';

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return new Date(this.current);
  }
  set(iso: string) {
    this.current = new Date(iso);
  }
}

/** Deterministic embeddings for tests: a hashed bag of words, so equal words land together. */
export const wordEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((text) => {
      const v = new Array<number>(64).fill(0);
      for (const word of text.toLowerCase().split(/\W+/).filter(Boolean)) {
        let h = 0;
        for (const ch of word) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        v[h % 64]! += 1;
      }
      return v;
    });
  },
};

/** An in-memory radar: empty database, replay-only model over a temporary recordings folder. */
export async function testContainer(options: { now?: string; llmDir?: string } = {}) {
  const config = loadConfig({
    ...process.env,
    FIREWORKS_API_KEY: '',
    LLM_MODE: 'replay',
    DEMO_MODE: 'false',
  });
  const clock = new FixedClock(new Date(options.now ?? '2026-10-17T18:00:00Z'));
  const llm = new RecordedLlm({
    dir: options.llmDir ?? mkdtempSync(join(tmpdir(), 'radar-llm-')),
    live: null,
    mode: 'replay',
  });
  return createContainer(config, { ephemeral: true, clock, llm, embedder: wordEmbedder });
}
