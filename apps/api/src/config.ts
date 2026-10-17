import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  /** PostgreSQL connection string. When absent, PGlite persists under DATA_DIR (ADR-0009). */
  DATABASE_URL: z.string().url().optional(),
  DATA_DIR: z.string().default(`${REPO_ROOT}.data`),
  /** Without a key the API replays recorded extractions only (ADR-0010). */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /**
   * Which reader serves documents: `auto` (recorded Claude extractions, plus live Claude when a
   * key is set) or `reference` (the dataset's ground truth — development and evaluation only).
   */
  READER: z.enum(['auto', 'reference']).default('auto'),
  EXTRACTION_MODEL: z.string().default('claude-opus-5-5'),
  EXTRACTION_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  /** Enables the demo user switcher, seeding and the guided months. Never in production. */
  DEMO_MODE: bool.default(true),
  APPROVAL_LINK_SECRET: z.string().min(16).default('mandato-local-dev-secret-change-me'),
  APPROVAL_LINK_TTL_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 24),
  /** Public URL of the web app, used to build approval links. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  /** Pause between bills when a guided month runs, so the UI can show them arriving. */
  DEMO_PACE_MS: z.coerce.number().int().min(0).default(350),
  /** Maximum upload size in bytes. */
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof EnvSchema> & { repoRoot: string };

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
