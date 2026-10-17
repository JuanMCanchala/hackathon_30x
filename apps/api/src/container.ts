/** Composition root (ADR-0008): wires adapters to ports from configuration. */
import { join } from 'node:path';
import { EXTRACTIONS_DIR } from '@mandato/dataset';
import type { Config } from './config';
import { openDatabase, type Database } from './db/client';
import { EventBus } from './events/bus';
import { CachedExtractor, ExtractionCache } from './extraction/cache';
import { ClaudeExtractor } from './extraction/claude';
import type { Extractor } from './extraction/types';
import { systemClock, type Clock } from './lib/common';
import type { Deps } from './services/deps';
import { PolicyCompiler } from './services/policy-compiler';
import { FileDocumentStore, MemoryDocumentStore, type DocumentStore } from './storage/documents';

export interface Container {
  deps: Deps;
  database: Database;
}

export interface ContainerOverrides {
  extractor?: Extractor;
  clock?: Clock;
  documents?: DocumentStore;
  /** In-memory database and document store (tests, evaluation harness). */
  ephemeral?: boolean;
}

export function liveReader(config: Config): ClaudeExtractor | null {
  return config.ANTHROPIC_API_KEY
    ? new ClaudeExtractor({
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.EXTRACTION_MODEL,
        effort: config.EXTRACTION_EFFORT,
      })
    : null;
}

export async function createContainer(
  config: Config,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  const database = overrides.ephemeral
    ? await openDatabase({})
    : await openDatabase({
        url: config.DATABASE_URL,
        dataDir: config.DATABASE_URL ? undefined : config.DATA_DIR,
      });
  const documents =
    overrides.documents ??
    (overrides.ephemeral
      ? new MemoryDocumentStore()
      : new FileDocumentStore(join(config.DATA_DIR, 'documents')));
  const extractor =
    overrides.extractor ??
    new CachedExtractor(new ExtractionCache(EXTRACTIONS_DIR), liveReader(config));
  const deps: Deps = {
    db: database.db,
    bus: new EventBus(),
    clock: overrides.clock ?? systemClock,
    documents,
    extractor,
    config,
    policyCompiler: config.ANTHROPIC_API_KEY
      ? new PolicyCompiler({ apiKey: config.ANTHROPIC_API_KEY, model: config.EXTRACTION_MODEL })
      : null,
  };
  return { deps, database };
}
