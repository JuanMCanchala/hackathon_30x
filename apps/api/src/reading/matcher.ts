import {
  LineMatchesSchema,
  type Contract,
  type ExtractedLine,
  type LineMatch,
} from '@recibido/domain';
import type { CachedLlm, LlmMeta } from '../llm/cache';
import { MATCHER_EXAMPLE, MATCHER_SYSTEM, matcherUser, type MatchInput } from './prompt';

/** Bump when the prompt or the input changes: old recordings stop replaying. */
export const MATCHER_VERSION = 'matcher-1';

export interface MatchRequest {
  lines: ExtractedLine[];
  contract: Contract;
}

export interface MatchResult {
  matches: LineMatch[] | null;
  error: string | null;
  meta: LlmMeta;
}

export interface Matcher {
  match(request: MatchRequest): Promise<MatchResult>;
}

/**
 * What the model sees and the cache key is computed from: line descriptions, units and
 * quantities, and the terms' ids, kinds and titles. No prices and no evidence, so new evidence
 * never causes a cache miss.
 */
export function matchInput(lines: ExtractedLine[], contract: Contract): MatchInput {
  return {
    lines: lines.map(({ description, unit, quantity }) => ({ description, unit, quantity })),
    terms: contract.terms.map(({ id, kind, title }) => ({ id, kind, title })),
  };
}

export class LineMatcher implements Matcher {
  constructor(private readonly llm: CachedLlm) {}

  async match({ lines, contract }: MatchRequest): Promise<MatchResult> {
    const input = matchInput(lines, contract);
    const { output, error, meta } = await this.llm.run({
      kind: 'match',
      version: MATCHER_VERSION,
      input,
      note: { contractId: contract.id },
      system: MATCHER_SYSTEM,
      user: matcherUser(input),
      schema: LineMatchesSchema,
      schemaHint: MATCHER_EXAMPLE,
    });
    return { matches: output?.matches ?? null, error, meta };
  }
}
