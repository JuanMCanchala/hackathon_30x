import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4310;
const WEB_PORT = 3310;
const DATA_DIR = fileURLToPath(new URL('./.e2e-data', import.meta.url));

// every run starts from an empty database: the API seeds the demo on first start. Workers load
// this file again while the API runs, so only the main process empties it.
if (!process.env.TEST_WORKER_INDEX) rmSync(DATA_DIR, { recursive: true, force: true });

export default defineConfig({
  testDir: 'e2e',
  // one demo state shared by the API: the specs run in order, never in parallel
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'es-CO',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @recibido/api exec tsx src/index.ts',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        DATA_DIR,
        DATABASE_URL: '',
        DEMO_MODE: 'true',
        DEMO_PACE_MS: '0',
        READER: 'auto',
        // no model: every reading comes from the recordings
        LLM_PROVIDER: 'none',
        DEEPSEEK_API_KEY_PRINCIPAL: '',
        OPENROUTER_API_KEY: '',
        GITHUB_REPO: '',
        PUBLIC_WEB_URL: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `pnpm --filter @recibido/web exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
