#!/usr/bin/env node
/**
 * Backfill: the same open searches as the regular capture, run once per past 7-day window, so
 * the radar has a baseline to measure growth against from day one. Only sources that can be
 * asked about a date window take part (Bluesky, Google News, Hacker News, GitHub), which keeps
 * every window sampled the same way: top 100 per query and window.
 *
 *   node packages/sources/scripts/backfill.mjs [--windows 8] [--only bluesky,news]
 *
 * Output: data/raw/<start>-backfill/<source>/<key>.<ext>.gz plus index.jsonl, as capture.mjs.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'data/raw');
const BROWSER =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const windowsBack = Number(flag('windows') ?? 8);
const only = flag('only')?.split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
const day = (d) => d.toISOString().slice(0, 10);

function rawGet(url, headers, hops = 3) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers, timeout: 30_000 }, (res) => {
      const location = res.headers.location;
      if (res.statusCode >= 300 && res.statusCode < 400 && location && hops > 0) {
        res.resume();
        resolve(rawGet(new URL(location, url).toString(), headers, hops - 1));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/** Past windows, newest first: window k ends k·7 days before now. */
function windows(now, count) {
  return Array.from({ length: count }, (_, i) => {
    const k = i + 1;
    const end = new Date(now.getTime() - k * 7 * 86_400_000);
    const start = new Date(end.getTime() - 7 * 86_400_000);
    return { k, start, end, label: day(end) };
  });
}

function plan(seeds, now) {
  const queries = [
    ...seeds.queries.es.map((q) => ({ q, lang: 'es' })),
    ...seeds.queries.en.map((q) => ({ q, lang: 'en' })),
  ];
  const ws = windows(now, windowsBack);
  const meta = (w, extra) => ({
    ...extra,
    window: { start: w.start.toISOString(), end: w.end.toISOString() },
  });
  return {
    bluesky: {
      pause: 350,
      requests: ws.flatMap((w) =>
        queries.map(({ q, lang }) => ({
          key: `w${w.k}-${lang}-${slug(q)}`,
          ext: 'json',
          url: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=100&sort=top&lang=${lang}&since=${w.start.toISOString()}&until=${w.end.toISOString()}`,
          headers: { 'user-agent': BROWSER },
          meta: meta(w, { query: q, lang, sort: 'top' }),
        })),
      ),
    },
    news: {
      pause: 900,
      requests: ws.flatMap((w) =>
        queries.map(({ q, lang }) => {
          // Google News reads before: as exclusive, so the window's end day is the bound.
          const text = `${q} after:${day(w.start)} before:${day(w.end)}`;
          return {
            key: `w${w.k}-${lang}-${slug(q)}`,
            ext: 'xml',
            url:
              lang === 'es'
                ? `https://news.google.com/rss/search?q=${encodeURIComponent(text)}&hl=es-419&gl=CO&ceid=CO:es-419`
                : `https://news.google.com/rss/search?q=${encodeURIComponent(text)}&hl=en-US&gl=US&ceid=US:en`,
            headers: {
              'user-agent': BROWSER,
              'accept-language': lang === 'es' ? 'es-419' : 'en-US',
            },
            meta: meta(w, { query: q, lang }),
          };
        }),
      ),
    },
    hn: {
      pause: 500,
      requests: ws.map((w) => ({
        key: `w${w.k}-stories`,
        ext: 'json',
        url: `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E${Math.floor(w.start.getTime() / 1000)},created_at_i%3C${Math.floor(w.end.getTime() / 1000)},points%3E10&hitsPerPage=1000`,
        headers: { 'user-agent': BROWSER },
        meta: meta(w, {}),
      })),
    },
    github: {
      pause: 7000,
      requests: ws.map((w) => ({
        key: `w${w.k}-new-repos`,
        ext: 'json',
        url: `https://api.github.com/search/repositories?q=${encodeURIComponent(`created:${day(w.start)}..${day(w.end)} stars:>30`)}&sort=stars&order=desc&per_page=100`,
        headers: { 'user-agent': BROWSER, accept: 'application/vnd.github+json' },
        meta: meta(w, { query: `created:${day(w.start)}..${day(w.end)} stars:>30` }),
      })),
    },
  };
}

async function runGroup(dir, source, group) {
  let ok = 0;
  for (const req of group.requests) {
    const capturedAt = new Date().toISOString();
    let status;
    let bytes = 0;
    let file = null;
    try {
      const res = await rawGet(req.url, req.headers);
      status = res.status;
      bytes = res.body.length;
      if (status >= 200 && status < 300 && bytes > 0) {
        file = `${source}/${req.key}.${req.ext}.gz`;
        await mkdir(join(dir, source), { recursive: true });
        await writeFile(join(dir, file), gzipSync(res.body));
        ok += 1;
      }
      if (status === 429) await sleep(20_000);
    } catch (error) {
      status = -1;
      req.meta.error = String(error?.message ?? error).slice(0, 200);
    }
    await appendFile(
      join(dir, 'index.jsonl'),
      `${JSON.stringify({ source, key: req.key, url: req.url, status, bytes, file, capturedAt, meta: req.meta })}\n`,
    );
    await sleep(group.pause);
  }
  return { source, ok, total: group.requests.length };
}

const seeds = JSON.parse(await readFile(join(ROOT, 'packages/sources/seeds.json'), 'utf8'));
const now = new Date();
const dir = join(OUT, `${now.toISOString().slice(0, 16).replace(':', '-')}-backfill`);
await mkdir(dir, { recursive: true });
const groups = Object.entries(plan(seeds, now)).filter(([s]) => !only || only.includes(s));
const results = await Promise.all(groups.map(([s, g]) => runGroup(dir, s, g)));
console.log(
  `[${new Date().toISOString()}] backfill ${dir}: ${results.map((r) => `${r.source} ${r.ok}/${r.total}`).join(', ')}`,
);
