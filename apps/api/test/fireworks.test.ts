import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { filePath, findBill } from '@mandato/dataset';
import { llmSettings, loadConfig } from '../src/config';
import { FireworksExtractor } from '../src/extraction/fireworks';
import { sha256 } from '../src/lib/common';

const options = {
  apiKey: 'fw_test',
  model: 'accounts/fireworks/models/deepseek-v4p1-flash',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
};

function documentOf(id: string) {
  const bill = findBill(id);
  const bytes = readFileSync(filePath(bill));
  return {
    bill,
    input: {
      bytes,
      mediaType: bill.mediaType,
      filename: basename(bill.file),
      sha256: sha256(bytes),
    },
  };
}

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof answer>) {
  const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url: call[0], body: JSON.parse(String(call[1].body)) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('language model selection', () => {
  const base = { DEMO_MODE: 'true' } as NodeJS.ProcessEnv;

  it('prefers Anthropic when both keys are set, and honours an explicit choice', () => {
    const both = { ...base, ANTHROPIC_API_KEY: 'sk', FIREWORKS_API_KEY: 'fw' };
    expect(llmSettings(loadConfig(both))?.provider).toBe('anthropic');
    expect(llmSettings(loadConfig({ ...both, LLM_PROVIDER: 'fireworks' }))).toMatchObject({
      provider: 'fireworks',
      model: 'accounts/fireworks/models/deepseek-v4p1-flash',
    });
  });

  it('uses Fireworks when it is the only key, and nothing without keys', () => {
    expect(llmSettings(loadConfig({ ...base, FIREWORKS_API_KEY: 'fw' }))?.provider).toBe(
      'fireworks',
    );
    expect(llmSettings(loadConfig(base))).toBeNull();
    expect(
      llmSettings(loadConfig({ ...base, LLM_PROVIDER: 'anthropic', FIREWORKS_API_KEY: 'fw' })),
    ).toBeNull();
  });
});

describe('Fireworks reader', () => {
  it('sends a PDF as its exact text layer plus page images, and validates the answer', async () => {
    const { bill, input } = documentOf('ago-04');
    const fetchMock = answer(200, {
      model: options.model,
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(bill.truth) } }],
      usage: { prompt_tokens: 1200, completion_tokens: 900 },
    });
    const result = await new FireworksExtractor(options).read(input);
    expect(result.extraction).toEqual(bill.truth);
    expect(result.usage).toMatchObject({ inputTokens: 1200, outputTokens: 900 });

    const { url, body } = sentBody(fetchMock);
    expect(url).toBe('https://api.fireworks.ai/inference/v1/chat/completions');
    expect(body.model).toBe(options.model);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.required).toContain('payout');
    const parts = body.messages[1].content as { type: string; text?: string }[];
    expect(parts[0]?.text).toContain('PDF document');
    expect(parts[0]?.text).toContain('VALENTINA RÍOS MEJÍA');
    expect(parts[1]?.type).toBe('image_url');
    expect(parts.at(-1)?.text).toContain('Extract this bill');
  });

  it('sends photos as images', async () => {
    const { bill, input } = documentOf('ago-06');
    const fetchMock = answer(200, {
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(bill.truth) } }],
    });
    await new FireworksExtractor(options).read(input);
    const parts = sentBody(fetchMock).body.messages[1].content as {
      type: string;
      image_url?: { url: string };
    }[];
    expect(parts[0]?.type).toBe('image_url');
    expect(parts[0]?.image_url?.url).toMatch(/^data:image\/png;base64,/);
  });

  it('reports failures in Spanish instead of throwing', async () => {
    const { input } = documentOf('ago-04');
    answer(401, { error: { message: 'unauthorized' } });
    const denied = await new FireworksExtractor(options).extract(input);
    expect(denied.extraction).toBeNull();
    expect(denied.error).toBe('la API de Fireworks rechazó la credencial');
    expect(denied.meta).toMatchObject({ provider: 'fireworks', cacheHit: false });

    answer(200, { choices: [{ finish_reason: 'stop', message: { content: '{"total": 3}' } }] });
    const invalid = await new FireworksExtractor(options).extract(input);
    expect(invalid.error).toBe('La lectura no cumple el esquema esperado.');
  });
});
