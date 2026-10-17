import { sql } from 'drizzle-orm';
import type { Config } from '../config';
import type { Db, Tx } from '../db/client';
import type { EventBus } from '../events/bus';
import type { Extractor } from '../extraction/types';
import type { Clock } from '../lib/common';
import type { DocumentStore } from '../storage/documents';
import type { StructuredLlm } from '../llm/structured';
import type { PolicyCompiler } from './policy-compiler';

/** Everything application services depend on: ports, wired by the composition root. */
export interface Deps {
  db: Db;
  bus: EventBus;
  clock: Clock;
  documents: DocumentStore;
  extractor: Extractor;
  config: Config;
  policyCompiler: PolicyCompiler | null;
  /** The language model for answers and drafts; null without a key. */
  llm: StructuredLlm | null;
}

/**
 * Runs `fn` in a transaction holding the organization's row lock (ADR-0011): decisions,
 * approvals, signatures and policy changes of one organization never interleave.
 */
export function withOrgLock<T>(db: Db, orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from organizations where id = ${orgId} for update`);
    return fn(tx);
  });
}

export function nowIso(deps: Deps, at?: string): string {
  return at ? new Date(at).toISOString() : deps.clock.now().toISOString();
}
