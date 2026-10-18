/**
 * JEV (TypeSafe) as the judge of the Vigía screen: two closed questions per piece, answered in
 * milliseconds for fractions of a cent. Is the piece really about the topic (not a passing mention,
 * a link or the author's name), and how useful is it for 30X's audience. JEV does not write; the
 * language model only reads what the screen lets through.
 */
import { inspect } from 'node:util';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { SystemOneRequest } from '@typesafe-ai/sdk';

/** Pinned so a model update cannot move the thresholds under us. */
export const JEV_MODEL = 'jev-1.13.0';
/** USD per million input tokens; output is free. */
export const JEV_USD_PER_MTOK = 0.042;

const FIT_LEVELS = [
  'Irrelevant or purely technical (kernels, benchmarks, research details)',
  'Tangential to running a business',
  'Somewhat useful for a business team',
  'Useful for business decisions in sales, growth or operations',
  'A CEO needs to know this tomorrow',
];

const QUESTIONS = {
  on_topic: {
    type: 'noul',
    instructions:
      'Is the main subject of `piece.text` the topic in `topic`? A passing mention, a link or the author name is not enough.',
  },
  audience_fit: {
    type: 'score',
    instructions:
      'How useful is this piece for founders, executives and sales or growth teams in Latin America learning to apply AI in their business?',
    criteria: FIT_LEVELS,
  },
} as const;

export interface PieceVerdict {
  /** Probability that the piece is about the topic, 0..1. */
  onTopic: number;
  /** Fit with 30X's audience, 1..10. */
  fit: number;
}

export interface JudgedPiece {
  key: string;
  platform: string;
  lang: string;
  text: string;
  author: string;
}

export interface PieceJudge {
  judge(
    topic: string,
    pieces: readonly JudgedPiece[],
  ): Promise<{ verdicts: Map<string, PieceVerdict>; inputTokens: number; ms: number }>;
}

export class JevUnavailableError extends Error {
  override name = 'JevUnavailableError';
}

/** The score level (0..4) on the 1..10 scale the radar uses for fit. */
const toFit = (level: number) =>
  Math.round(
    1 + (Math.min(Math.max(level, 0), FIT_LEVELS.length - 1) / (FIT_LEVELS.length - 1)) * 9,
  );

/** What went wrong, in words, without the key: a server may echo the key it rejected. */
function describe(error: unknown, apiKey: string): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return inspect(text).includes(apiKey) ? text.replaceAll(apiKey, '[redacted]') : text;
}

export function createJevJudge(cfg: {
  apiKey: string;
  fetch?: typeof fetch;
  concurrency?: number;
  /** Retries per call after the first attempt; the SDK default is 2. */
  retries?: number;
  timeoutMs?: number;
}): PieceJudge {
  const apiKey = cfg.apiKey.trim();
  if (!apiKey) throw new Error('createJevJudge needs an API key');
  const sdk = new TypeSafeClient({
    apiKey,
    // Spelled out so that TYPESAFE_BASE_URL in the environment cannot redirect the key.
    baseURL: 'https://api.typesafe.ai',
    timeout: cfg.timeoutMs ?? 10_000,
    fetch: cfg.fetch,
    compression: cfg.fetch ? false : undefined,
    retry: cfg.retries === undefined ? undefined : { maxRetries: cfg.retries },
    logLevel: 'off',
  });
  const concurrency = Math.max(1, cfg.concurrency ?? 8);

  return {
    async judge(topic, pieces) {
      const started = performance.now();
      const verdicts = new Map<string, PieceVerdict>();
      let inputTokens = 0;
      let lastError: unknown = null;

      const ask = async (p: JudgedPiece) => {
        try {
          const res = await sdk.systemOne(
            {
              model: JEV_MODEL,
              state: {
                topic,
                piece: { platform: p.platform, lang: p.lang, text: p.text, author: p.author },
              },
              questions: QUESTIONS,
            } as unknown as SystemOneRequest,
            { signal: AbortSignal.timeout(15_000) },
          );
          const answers = res.answers as Record<string, { noul?: number; score?: number }>;
          const onTopic = answers.on_topic?.noul;
          const level = answers.audience_fit?.score;
          if (typeof onTopic !== 'number' || typeof level !== 'number')
            throw new Error('JEV answered without on_topic or audience_fit');
          verdicts.set(p.key, { onTopic, fit: toFit(level) });
          inputTokens += res.usage?.input_tokens ?? 0;
        } catch (error) {
          lastError = error;
        }
      };

      // A fixed pool of workers: one JEV call per piece, at most `concurrency` at a time.
      let next = 0;
      const worker = async () => {
        while (next < pieces.length) await ask(pieces[next++]!);
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, pieces.length) }, worker));

      if (pieces.length > 0 && verdicts.size === 0)
        throw new JevUnavailableError(`JEV no respondió: ${describe(lastError, apiKey)}`);
      return { verdicts, inputTokens, ms: Math.round(performance.now() - started) };
    },
  };
}
