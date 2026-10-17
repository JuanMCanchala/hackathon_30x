import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  /** PostgreSQL connection string. When absent, PGlite persists under DATA_DIR. */
  DATABASE_URL: z.string().url().optional(),
  DATA_DIR: z.string().default(`${REPO_ROOT}.data/radar`),
  /** Raw captures written by packages/sources/scripts/capture.mjs. */
  RAW_DIR: z.string().default(`${REPO_ROOT}data/raw`),
  /** Recorded language-model answers, versioned so the demo replays without network. */
  LLM_CACHE_DIR: z.string().default(`${REPO_ROOT}data/llm-cache`),
  /** The exported database the demo starts from when its own database is empty. */
  SNAPSHOT_DIR: z.string().default(`${REPO_ROOT}data/snapshot`),
  /**
   * `auto`: recorded answers first, then the live model when a key is set.
   * `replay`: recorded answers only (tests, CI, a demo without network).
   */
  LLM_MODE: z.enum(['auto', 'replay']).default('auto'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  FIREWORKS_API_KEY: z.string().min(1).optional(),
  FIREWORKS_MODEL: z.string().default('accounts/fireworks/models/deepseek-v4p1-flash'),
  FIREWORKS_BASE_URL: z.string().url().default('https://api.fireworks.ai/inference/v1'),
  EMBEDDING_MODEL: z.string().default('accounts/fireworks/models/qwen3-embedding-8b'),
  /** Which language model writes: `auto` prefers Fireworks, the one the radar was tuned with. */
  LLM_PROVIDER: z.enum(['auto', 'anthropic', 'fireworks']).default('auto'),
  /** Optional: LinkedIn search by keyword through Apify. Without it LinkedIn comes from seeds. */
  APIFY_TOKEN: z.string().min(1).optional(),
  /** Seeds the database from SNAPSHOT_DIR when it is empty. */
  DEMO_MODE: bool.default(true),
  /** Public URL of the web app. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3300'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof EnvSchema> & { repoRoot: string };

export interface LlmSettings {
  provider: 'anthropic' | 'fireworks';
  apiKey: string;
  model: string;
}

/** The language model that writes, or null without a key. */
export function llmSettings(config: Config): LlmSettings | null {
  const anthropic = config.ANTHROPIC_API_KEY
    ? {
        provider: 'anthropic' as const,
        apiKey: config.ANTHROPIC_API_KEY,
        model: config.ANTHROPIC_MODEL,
      }
    : null;
  const fireworks = config.FIREWORKS_API_KEY
    ? {
        provider: 'fireworks' as const,
        apiKey: config.FIREWORKS_API_KEY,
        model: config.FIREWORKS_MODEL,
      }
    : null;
  if (config.LLM_PROVIDER === 'anthropic') return anthropic;
  if (config.LLM_PROVIDER === 'fireworks') return fireworks;
  return fireworks ?? anthropic;
}

/** Reads the repository's .env when there is one; variables already set in the shell win. */
export function loadDotEnv(path = `${REPO_ROOT}.env`): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty variables (common in .env files and container configs) count as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  return { ...parsed.data, repoRoot: REPO_ROOT };
}
