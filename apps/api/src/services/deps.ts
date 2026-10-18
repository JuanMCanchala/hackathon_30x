import type { Config } from '../config';
import type { Db } from '../db/client';
import type { EventBus } from '../events/bus';
import type { PieceJudge } from '../jev/client';
import type { Clock } from '../lib/common';
import type { Llm } from '../llm/cached';
import type { Embedder } from '../llm/embeddings';

/** Everything application services depend on, wired by the composition root. */
export interface Deps {
  db: Db;
  bus: EventBus;
  clock: Clock;
  config: Config;
  /** Recorded answers first; the live model only for questions never asked. */
  llm: Llm;
  embedder: Embedder;
  /** JEV judges topic and fit in the Vigía screen; null without a key or in replay mode. */
  jev: PieceJudge | null;
}

export function nowIso(deps: Deps): string {
  return deps.clock.now().toISOString();
}
