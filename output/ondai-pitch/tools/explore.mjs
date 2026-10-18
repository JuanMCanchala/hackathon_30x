// Screenshot every route once and dump its visible headings and buttons, to plan the captures.
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, settle, BASE } from './browser.mjs';

const out = process.argv[2] ?? 'explore';
mkdirSync(out, { recursive: true });
const routes = (process.argv[3] ?? '/,/radar,/elegir,/calendario,/vigia,/evaluacion,/empresa,/maquetas').split(',');

const { browser, page } = await launch();
const report = {};
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: 'networkidle2', timeout: 60000 });
  await settle(page, 2500);
  const name = r === '/' ? 'landing' : r.replace(/\//g, '_').replace(/^_/, '');
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  report[r] = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    headings: [...document.querySelectorAll('h1,h2,h3')].map((h) => h.textContent.trim()).slice(0, 40),
    buttons: [...document.querySelectorAll('button,a')]
      .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim())
      .filter(Boolean)
      .slice(0, 60),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/')).slice(0, 60),
  }));
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
