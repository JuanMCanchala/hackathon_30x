import { describe, expect, it } from 'vitest';
import { JevUnavailableError, createJevJudge } from '../src/jev/client';

const KEY = 'ts_test_secret_key_123';

const piece = (key: string) => ({
  key,
  platform: 'youtube',
  lang: 'en',
  text: 'How AI agents are changing small business',
  author: 'Some Creator',
});

const answer = (onTopic: number, score: number) => ({
  model: 'jev-1.13.0',
  answers: {
    on_topic: { type: 'noul', noul: onTopic },
    audience_fit: { type: 'score', score, legend: {}, probabilities: {}, confidence: 0.8 },
  },
  usage: { input_tokens: 120, output_tokens: 0 },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createJevJudge', () => {
  it('judges each piece and maps the answers', async () => {
    const bodies: unknown[] = [];
    const judge = createJevJudge({
      apiKey: KEY,
      retries: 0,
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return json(answer(0.91, 3));
      },
    });
    const { verdicts, inputTokens } = await judge.judge('negocios', [piece('yt:1')]);
    expect(verdicts.get('yt:1')).toEqual({ onTopic: 0.91, fit: 8 });
    expect(inputTokens).toBe(120);
    const sent = bodies[0] as { state: { topic: string }; questions: Record<string, unknown> };
    expect(sent.state.topic).toBe('negocios');
    expect(Object.keys(sent.questions).sort()).toEqual(['audience_fit', 'on_topic']);
  });

  it('skips a piece whose call fails and keeps the rest', async () => {
    let n = 0;
    const judge = createJevJudge({
      apiKey: KEY,
      retries: 0,
      concurrency: 1,
      fetch: async () => (n++ === 0 ? json({ error: 'boom' }, 500) : json(answer(0.4, 1))),
    });
    const { verdicts } = await judge.judge('negocios', [piece('yt:1'), piece('yt:2')]);
    expect([...verdicts.keys()]).toEqual(['yt:2']);
    expect(verdicts.get('yt:2')).toEqual({ onTopic: 0.4, fit: 3 });
  });

  it('throws JevUnavailableError without the key when every call fails', async () => {
    const judge = createJevJudge({
      apiKey: KEY,
      retries: 0,
      fetch: async () => json({ error: { message: `invalid key ${KEY}` } }, 401),
    });
    const error = await judge.judge('negocios', [piece('yt:1')]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JevUnavailableError);
    expect((error as Error).message).not.toContain(KEY);
  });

  it('asks nothing when there are no pieces', async () => {
    const judge = createJevJudge({
      apiKey: KEY,
      fetch: async () => {
        throw new Error('should not call');
      },
    });
    const { verdicts, inputTokens } = await judge.judge('negocios', []);
    expect(verdicts.size).toBe(0);
    expect(inputTokens).toBe(0);
  });
});
