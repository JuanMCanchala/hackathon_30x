import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LlmCache, stableJson } from '../src/llm/cache';

describe('LlmCache', () => {
  const cache = new LlmCache(mkdtempSync(join(tmpdir(), 'recibido-cache-')));

  it('keys are stable across object key order', () => {
    const a = cache.key('match', 'matcher-1', {
      lines: [{ a: 1, b: [2, { c: 3, d: 4 }] }],
      x: 'y',
    });
    const b = cache.key('match', 'matcher-1', {
      x: 'y',
      lines: [{ b: [2, { d: 4, c: 3 }], a: 1 }],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(stableJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('keys change with the kind, the version and the input', () => {
    const base = cache.key('read', 'reader-1', { sha256: 'abc' });
    expect(cache.key('match', 'reader-1', { sha256: 'abc' })).not.toBe(base);
    expect(cache.key('read', 'reader-2', { sha256: 'abc' })).not.toBe(base);
    expect(cache.key('read', 'reader-1', { sha256: 'abd' })).not.toBe(base);
  });

  it('stores and returns records by kind and key', async () => {
    const key = cache.key('read', 'reader-1', { sha256: 'abc' });
    expect(await cache.get('read', key)).toBeNull();
    const record = {
      key,
      kind: 'read' as const,
      version: 'reader-1',
      model: 'm',
      provider: 'deepseek',
      recordedAt: '2026-10-17T00:00:00.000Z',
      latencyMs: 12,
      usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0 },
      input: { sha256: 'abc' },
      output: { ok: true },
    };
    await cache.put('read', record);
    expect(await cache.get('read', key)).toEqual(record);
    expect(await cache.get('match', key)).toBeNull();
  });
});
