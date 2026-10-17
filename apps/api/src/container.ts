/** Composition root (ADR-0008): wires adapters to ports from configuration. */
import { join } from 'node:path';
import { EXTRACTIONS_DIR } from '@mandato/dataset';
import { llmSettings, type Config } from './config';
import { openDatabase, type Database } from './db/client';
import { EventBus } from './events/bus';
import { CachedExtractor, ExtractionCache } from './extraction/cache';
import { ClaudeExtractor } from './extraction/claude';
import { FireworksExtractor } from './extraction/fireworks';
import { GroundTruthExtractor } from './extraction/truth';
import type { Extractor, LiveReader } from './extraction/types';
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

/** The configured language model as a live document reader (ADR-0010, ADR-0017). */
export function liveReader(config: Config): LiveReader | null {
  const llm = llmSettings(config);
  if (!llm) return null;
  return llm.provider === 'anthropic'
    ? new ClaudeExtractor({
        apiKey: llm.apiKey,
        model: llm.model,
        effort: config.EXTRACTION_EFFORT,
      })
    : new FireworksExtractor({
        apiKey: llm.apiKey,
        model: llm.model,
        baseUrl: config.FIREWORKS_BASE_URL,
      });
}

function policyCompiler(config: Config): PolicyCompiler | null {
  const llm = llmSettings(config);
  if (!llm) return null;
  return llm.provider === 'anthropic'
    ? new PolicyCompiler({ provider: 'anthropic', apiKey: llm.apiKey, model: llm.model })
    : new PolicyCompiler({
        provider: 'fireworks',
        apiKey: llm.apiKey,
        model: llm.model,
        baseUrl: config.FIREWORKS_BASE_URL,
      });
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
    (config.READER === 'reference'
      ? new GroundTruthExtractor()
      : new CachedExtractor(new ExtractionCache(EXTRACTIONS_DIR), liveReader(config)));
  const deps: Deps = {
    db: database.db,
    bus: new EventBus(),
    clock: overrides.clock ?? systemClock,
    documents,
    extractor,
    config,
    policyCompiler: policyCompiler(config),
  };
  return { deps, database };
}
