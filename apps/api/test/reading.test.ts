import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BILLS, CONTRACTS, filesDir, findBill } from '@recibido/dataset';
import type { Contract } from '@recibido/domain';
import { describe, expect, it, vi } from 'vitest';
import { documentText as datasetDocumentText } from '../../../packages/dataset/test/documents';
import { loadConfig, type LlmConfig } from '../src/config';
import { CachedLlm, LlmCache } from '../src/llm/cache';
import { documentText, sha256Hex } from '../src/reading/documents';
import { LineMatcher, matchInput } from '../src/reading/matcher';
import { BillReader } from '../src/reading/reader';
import { ReferenceMatcher, ReferenceReader } from '../src/reading/reference';

const LIVE: LlmConfig = {
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'test-key',
  model: 'deepseek-flash',
};
const NONE = loadConfig({}).llm;

const tempCache = () => new LlmCache(mkdtempSync(join(tmpdir(), 'recibido-rec-')));

function completion(content: string | null): Response {
  return new Response(
    JSON.stringify({
      model: 'deepseek-flash',
      choices: [{ finish_reason: 'stop', message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** A fake fetch that answers each call with the next content, as DeepSeek would. */
function fetchReturning(...contents: (string | null)[]) {
  const queue = [...contents];
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    completion(queue.shift() ?? null),
  );
}

const bill = findBill('oct-06');
const bytes = readFileSync(join(filesDir(), bill.file));
async function doc() {
  const { channel, text } = await documentText(bytes, bill.file);
  return { sha256: sha256Hex(bytes), filename: bill.file, channel, text };
}

describe('documentText', () => {
  it('reads the oct-06 e-mail body and its attached PDF, Pix key included', async () => {
    const { channel, text } = await documentText(bytes, bill.file);
    expect(channel).toBe('email');
    expect(text).toContain('+55 11 98877-6655');
    expect(text).toContain('TM-2026-09');
  });

  it('gives every dataset bill the same text the dataset tests see', async () => {
    for (const spec of BILLS) {
      const data = readFileSync(join(filesDir(), spec.file));
      const { channel, text } = await documentText(data, spec.file);
      expect(text, spec.id).toBe(await datasetDocumentText(spec));
      expect(channel, spec.id).toBe(spec.channel === 'portal' ? 'pdf' : spec.channel);
    }
  });
});

describe('BillReader', () => {
  it('parses a DeepSeek-shaped completion into an ExtractedBill', async () => {
    const fetch = fetchReturning(JSON.stringify(bill.truth));
    const reader = new BillReader(new CachedLlm(tempCache(), LIVE, { fetch }));
    const result = await reader.read(await doc());
    expect(result.error).toBeNull();
    expect(result.reading).toEqual(bill.truth);
    expect(result.meta).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-flash',
      cacheHit: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    const body = JSON.parse(String(init?.body)) as { response_format: unknown; messages: unknown };
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body.messages)).toContain('json');
  });

  it('retries once, then gives up on invalid JSON', async () => {
    const fetch = fetchReturning('not json', '{"vendorName": 3}');
    const reader = new BillReader(new CachedLlm(tempCache(), LIVE, { fetch }));
    const result = await reader.read(await doc());
    expect(result.reading).toBeNull();
    expect(result.error).toMatch(/JSON/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('treats an empty answer as invalid and retries it', async () => {
    const fetch = fetchReturning('', JSON.stringify(bill.truth));
    const reader = new BillReader(new CachedLlm(tempCache(), LIVE, { fetch }));
    const result = await reader.read(await doc());
    expect(result.reading).toEqual(bill.truth);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('without a key and without a recording, reports the document unread', async () => {
    const fetch = fetchReturning();
    expect(NONE.provider).toBe('none');
    const reader = new BillReader(new CachedLlm(tempCache(), NONE, { fetch }));
    const result = await reader.read(await doc());
    expect(result.reading).toBeNull();
    expect(result.error).toBe('sin lectura grabada y sin modelo configurado');
    expect(result.meta.provider).toBe('none');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records with record on, then replays without calling the model', async () => {
    const cache = tempCache();
    const recordFetch = fetchReturning(JSON.stringify(bill.truth));
    const recorder = new BillReader(
      new CachedLlm(cache, LIVE, { fetch: recordFetch, record: true }),
    );
    await recorder.read(await doc());

    const fetch = fetchReturning();
    const result = await new BillReader(new CachedLlm(cache, NONE, { fetch })).read(await doc());
    expect(result.reading).toEqual(bill.truth);
    expect(result.meta).toMatchObject({ cacheHit: true, model: 'deepseek-flash' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('LineMatcher', () => {
  const contract = CONTRACTS.find((c) => c.vendorId === 'thiago-moreira')!;
  const lines = bill.truth.lines;
  const key = (c: Contract) => tempCache().key('match', 'matcher-1', matchInput(lines, c));

  it('keys on lines and term ids, kinds and titles only', () => {
    const changed: Contract = {
      ...contract,
      terms: contract.terms.map((t) => ({
        ...t,
        unitPriceMinor: t.unitPriceMinor + 1,
        evidence: { type: 'ticket', key: 'X-1' },
      })),
    };
    expect(key(changed)).toBe(key(contract));
    const renamed = { ...contract, terms: contract.terms.map((t) => ({ ...t, title: 'otro' })) };
    expect(key(renamed)).not.toBe(key(contract));
  });

  it('records a match and replays it when only the evidence changed', async () => {
    const cache = tempCache();
    const answer = JSON.stringify({ matches: bill.truthMatches });
    const live = new LineMatcher(
      new CachedLlm(cache, LIVE, { fetch: fetchReturning(answer), record: true }),
    );
    const first = await live.match({ lines, contract });
    expect(first.error).toBeNull();
    expect(first.matches).toEqual(bill.truthMatches);

    const fetch = fetchReturning();
    const replay = new LineMatcher(new CachedLlm(cache, NONE, { fetch }));
    const changed = { ...contract, terms: contract.terms.map((t) => ({ ...t, evidence: null })) };
    const second = await replay.match({ lines, contract: changed });
    expect(second.matches).toEqual(bill.truthMatches);
    expect(second.meta.cacheHit).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('reference reader and matcher', () => {
  it('serve the ground truth of every dataset bill', async () => {
    const reader = new ReferenceReader();
    const matcher = new ReferenceMatcher();
    for (const spec of BILLS) {
      const data = readFileSync(join(filesDir(), spec.file));
      const { channel, text } = await documentText(data, spec.file);
      const read = await reader.read({
        sha256: sha256Hex(data),
        filename: spec.file,
        channel,
        text,
      });
      expect(read.reading, spec.id).toEqual(spec.truth);
      const contract = CONTRACTS.find((c) =>
        spec.truthMatches.some((m) => c.terms.some((t) => t.id === m.termId)),
      );
      if (!contract) continue;
      const matched = await matcher.match({ lines: spec.truth.lines, contract });
      expect(matched.matches, spec.id).toEqual(spec.truthMatches);
    }
  });

  it('report an unknown document as unread', async () => {
    const read = await new ReferenceReader().read({
      sha256: '0'.repeat(64),
      filename: 'x.pdf',
      channel: 'pdf',
      text: '',
    });
    expect(read.reading).toBeNull();
    expect(read.error).not.toBeNull();
  });
});

describe('loadConfig', () => {
  it('auto picks DeepSeek, then OpenRouter, then none', () => {
    expect(loadConfig({ DEEPSEEK_API_KEY_PRINCIPAL: 'a', OPENROUTER_API_KEY: 'b' }).llm).toEqual({
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: 'a',
      model: 'deepseek-flash',
    });
    expect(loadConfig({ OPENROUTER_API_KEY: 'b' }).llm).toEqual({
      provider: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'b',
      model: 'deepseek/deepseek-v4.1-flash',
    });
    expect(loadConfig({ DEEPSEEK_API_KEY_PRINCIPAL: '' }).llm.provider).toBe('none');
    const forced = loadConfig({ LLM_PROVIDER: 'none', DEEPSEEK_API_KEY_PRINCIPAL: 'a' }).llm;
    expect(forced).toMatchObject({ provider: 'none', apiKey: null });
  });
});
