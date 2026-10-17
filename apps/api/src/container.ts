/** Composition root: wires the database, the language model and the embedder from configuration. */
import { join } from 'node:path';
import type { Config } from './config';
import { openDatabase, type Database } from './db/client';
import { llmUsage } from './db/schema';
import { EventBus } from './events/bus';
import { newId, systemClock, type Clock } from './lib/common';
import { RecordedLlm, type Llm, type LlmUsage } from './llm/cached';
import { CachedEmbedder, type Embedder } from './llm/embeddings';
import type { Deps } from './services/deps';

export interface Container {
  deps: Deps;
  database: Database;
}

export interface ContainerOverrides {
  llm?: Llm;
  embedder?: Embedder;
  clock?: Clock;
  /** In-memory database (tests). */
  ephemeral?: boolean;
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
  const db = database.db;
  const clock = overrides.clock ?? systemClock;
  const key = config.FIREWORKS_API_KEY;
  const recordUsage = async (usage: LlmUsage) => {
    await db
      .insert(llmUsage)
      .values({ id: newId('llm'), ...usage, at: clock.now().toISOString() })
      .catch(() => undefined);
  };
  const llm =
    overrides.llm ??
    new RecordedLlm({
      dir: config.LLM_CACHE_DIR,
      mode: config.LLM_MODE,
      live: key
        ? { baseUrl: config.FIREWORKS_BASE_URL, apiKey: key, model: config.FIREWORKS_MODEL }
        : null,
      onUsage: recordUsage,
    });
  const embedder =
    overrides.embedder ??
    new CachedEmbedder(
      join(config.DATA_DIR, 'embeddings.jsonl'),
      key && config.LLM_MODE !== 'replay'
        ? {
            baseUrl: config.FIREWORKS_BASE_URL,
            apiKey: key,
            model: config.EMBEDDING_MODEL,
            dimensions: 512,
          }
        : null,
      `${config.EMBEDDING_MODEL}@512`,
    );
  const deps: Deps = { db, bus: new EventBus(), clock, config, llm, embedder };
  return { deps, database };
}
