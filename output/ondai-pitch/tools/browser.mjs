// Shared headless browser for capturing the real OndAI UI (local demo week, DEMO_MODE=true).
// Uses the Chrome that HyperFrames already downloaded and the puppeteer-core in the npx cache;
// override with PUPPETEER_CORE and CHROME_BIN.
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);

function findPuppeteer() {
  if (process.env.PUPPETEER_CORE) return process.env.PUPPETEER_CORE;
  const npx = join(os.homedir(), '.npm/_npx');
  for (const dir of readdirSync(npx)) {
    const p = join(npx, dir, 'node_modules/puppeteer-core');
    if (existsSync(p)) return p;
  }
  throw new Error('puppeteer-core not found; set PUPPETEER_CORE');
}

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const base = join(os.homedir(), '.cache/hyperframes/chrome/chrome-headless-shell');
  for (const v of readdirSync(base)) {
    const p = join(base, v, 'chrome-headless-shell-linux64/chrome-headless-shell');
    if (existsSync(p)) return p;
  }
  throw new Error('chrome-headless-shell not found; set CHROME_BIN');
}

export const BASE = process.env.ONDAI_URL ?? 'http://localhost:3300';
export const VIEWPORT = { width: 1440, height: 810, deviceScaleFactor: 2 };

export async function launch() {
  const puppeteer = require(findPuppeteer());
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  return { browser, page };
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function settle(page, ms = 1200) {
  await page.evaluate(() => document.fonts.ready);
  await wait(ms);
}
