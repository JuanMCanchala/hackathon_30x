/**
 * Configuration from the environment only (keys come from `wallenv run`; no .env file is read).
 * Key values are never logged: use `describeLlm` for anything printed.
 */
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  /** PostgreSQL connection string. When absent, PGlite persists under DATA_DIR. */
  DATABASE_URL: z.string().url().optional(),
  DATA_DIR: z.string().default(`${REPO_ROOT}.data`),
  LLM_PROVIDER: z.enum(['auto', 'deepseek', 'openrouter', 'none']).default('auto'),
  DEEPSEEK_API_KEY_PRINCIPAL: z.string().min(1).optional(),
  DEEPSEEK_BASE_URL: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_MODEL: z.string().default('deepseek-flash'),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().default('deepseek/deepseek-v4.1-flash'),
  /** `auto`: recorded answers, plus the model live when configured. `reference`: ground truth (eval). */
  READER: z.enum(['auto', 'reference']).default('auto'),
  /** Write live model answers to packages/dataset/recordings. */
  RECORD: bool.default(false),
  DEMO_MODE: bool.default(true),
  /** Outside demo mode, required (≥ 24 chars): `Authorization: Bearer` on every mutating route. */
  ADMIN_TOKEN: z.string().optional(),
  /** Who the admin token acts as in human actions (outside demo mode). */
  ADMIN_ACTOR: z.string().min(1).max(120).default('Administrador'),
  /** Signs the demo inbox's portal links (HMAC of the bill id). Demo mode has a built-in one. */
  PORTAL_TOKEN_SECRET: z.string().min(24).optional(),
  DEMO_PACE_MS: z.coerce.number().int().min(0).default(400),
  GITHUB_REPO: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_DEMO_PR: z.coerce.number().int().positive().optional(),
  GITHUB_POLL_MS: z.coerce.number().int().positive().default(5000),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
});

export type LlmProvider = 'deepseek' | 'openrouter' | 'none';

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  /** null when provider is 'none' */
  apiKey: string | null;
  model: string;
}

export interface Config {
  port: number;
  databaseUrl: string | null;
  dataDir: string;
  llm: LlmConfig;
  reader: 'auto' | 'reference';
  record: boolean;
  demoMode: boolean;
  /** null only in demo mode */
  adminToken: string | null;
  adminActor: string;
  /** signs stateless portal links; null outside demo mode without PORTAL_TOKEN_SECRET */
  portalTokenSecret: string | null;
  demoPaceMs: number;
  github: {
    repo: string | null;
    token: string | null;
    webhookSecret: string | null;
    demoPr: number | null;
    pollMs: number;
  };
  publicWebUrl: string;
  apiUrl: string;
  repoRoot: string;
}

type Env = z.infer<typeof EnvSchema>;

/** `auto` prefers DeepSeek, then OpenRouter. A provider without its key is 'none'. */
function llmConfig(env: Env): LlmConfig {
  const deepseek: LlmConfig | null = env.DEEPSEEK_API_KEY_PRINCIPAL
    ? {
        provider: 'deepseek',
        baseUrl: env.DEEPSEEK_BASE_URL,
        apiKey: env.DEEPSEEK_API_KEY_PRINCIPAL,
        model: env.DEEPSEEK_MODEL,
      }
    : null;
  const openrouter: LlmConfig | null = env.OPENROUTER_API_KEY
    ? {
        provider: 'openrouter',
        baseUrl: env.OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL,
      }
    : null;
  const chosen =
    env.LLM_PROVIDER === 'deepseek'
      ? deepseek
      : env.LLM_PROVIDER === 'openrouter'
        ? openrouter
        : env.LLM_PROVIDER === 'auto'
          ? (deepseek ?? openrouter)
          : null;
  return chosen ?? { provider: 'none', baseUrl: '', apiKey: null, model: '' };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty variables count as unset.
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    // Paths only: an issue message never carries the offending value.
    const issues = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const e = parsed.data;
  if (!e.DEMO_MODE && (e.ADMIN_TOKEN ?? '').length < 24)
    throw new Error(
      'Invalid configuration: ADMIN_TOKEN (≥ 24 chars) is required when DEMO_MODE=false',
    );
  return {
    port: e.PORT,
    databaseUrl: e.DATABASE_URL ?? null,
    dataDir: e.DATA_DIR,
    llm: llmConfig(e),
    reader: e.READER,
    record: e.RECORD,
    demoMode: e.DEMO_MODE,
    adminToken: e.ADMIN_TOKEN ?? null,
    adminActor: e.ADMIN_ACTOR,
    portalTokenSecret:
      e.PORTAL_TOKEN_SECRET ?? (e.DEMO_MODE ? 'recibido-demo-portal-links-v1' : null),
    demoPaceMs: e.DEMO_PACE_MS,
    github: {
      repo: e.GITHUB_REPO ?? null,
      token: e.GITHUB_TOKEN ?? null,
      webhookSecret: e.GITHUB_WEBHOOK_SECRET ?? null,
      demoPr: e.GITHUB_DEMO_PR ?? null,
      pollMs: e.GITHUB_POLL_MS,
    },
    publicWebUrl: e.PUBLIC_WEB_URL,
    apiUrl: e.API_URL,
    repoRoot: REPO_ROOT,
  };
}

/** Safe to print: provider and model, never the key. */
export function describeLlm(llm: LlmConfig): string {
  return llm.provider === 'none' ? 'none (replay only)' : `${llm.provider} · ${llm.model}`;
}
