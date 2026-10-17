/**
 * Captures pages of an already running web app at phone and desktop widths.
 *
 *   node scripts/screenshots.mjs [--dark] [--full] <url> [<url> ...]
 *
 * Starts nothing itself: run the API and the web first (`pnpm dev`). Files land in
 * .screenshots/<path>-<width>[-dark].png. Waits for the network and the proof-bar fill to settle.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
];

const args = process.argv.slice(2);
const dark = args.includes('--dark');
const fullPage = args.includes('--full');
const urls = args.filter((a) => !a.startsWith('--'));
if (urls.length === 0) {
  console.error('Usage: node scripts/screenshots.mjs [--dark] [--full] <url> [<url> ...]');
  process.exit(1);
}

const outDir = join(process.cwd(), '.screenshots');
mkdirSync(outDir, { recursive: true });

const slug = (url) => {
  const { pathname } = new URL(url);
  return pathname === '/' ? 'home' : pathname.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-');
};

const browser = await chromium.launch();
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      colorScheme: dark ? 'dark' : 'light',
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error(`  page error on ${page.url()}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && console.error(`  console: ${m.text()}`));
    for (const url of urls) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const file = join(outDir, `${slug(url)}-${viewport.width}${dark ? '-dark' : ''}.png`);
      await page.screenshot({ path: file, fullPage });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
