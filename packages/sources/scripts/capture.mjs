#!/usr/bin/env node
/**
 * Raw capture of public sources. It saves each response as it came, gzipped, so history piles up
 * while the parsers are written, and every parser can be re-run on old captures.
 *
 *   node packages/sources/scripts/capture.mjs                 one run
 *   node packages/sources/scripts/capture.mjs --every 120     one run every 120 minutes
 *   node packages/sources/scripts/capture.mjs --only x,hn     only some sources
 *
 * Output: data/raw/<run>/<source>/<key>.<ext>.gz and data/raw/<run>/index.jsonl.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { request } from 'node:https';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'data/raw');
const BROWSER =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const INSTAGRAM_APP =
  'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; es_US; 541635890)';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const every = Number(flag('every') ?? 0);
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
const isoDay = (d) => d.toISOString().slice(0, 10);

/** Per-language settings: the browser's language and Google News' edition. */
const LANGS = {
  es: { accept: 'es-419,es;q=0.9', news: 'hl=es-419&gl=CO&ceid=CO:es-419' },
  en: { accept: 'en-US,en;q=0.9', news: 'hl=en-US&gl=US&ceid=US:en' },
  pt: { accept: 'pt-BR,pt;q=0.9', news: 'hl=pt-BR&gl=BR&ceid=BR:pt-419' },
};

/** Every request of one run, grouped by source; each group runs in order with its own pause. */
function plan(seeds, now) {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const t7 = Math.floor(weekAgo.getTime() / 1000);
  // Viral AI content usually starts in English or Portuguese and reaches Spanish later: the
  // radar listens to all three to see a wave before it arrives.
  const all = Object.entries(seeds.queries).flatMap(([lang, qs]) => qs.map((q) => ({ q, lang })));
  const browser = (lang) => ({ 'user-agent': BROWSER, 'accept-language': LANGS[lang].accept });

  return {
    youtube: {
      pause: 1500,
      requests: all.map(({ q, lang }) => ({
        key: `${lang}-${slug(q)}`,
        ext: 'html',
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIIAw%253D%253D`,
        headers: browser(lang),
        meta: { query: q, lang },
      })),
    },
    bluesky: {
      pause: 400,
      // Top 100 per query and 7-day window, exactly as the backfill samples past windows.
      requests: all.map(({ q, lang }) => ({
        key: `${lang}-${slug(q)}-top`,
        ext: 'json',
        url: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=100&sort=top&lang=${lang}&since=${weekAgo.toISOString()}`,
        headers: { 'user-agent': BROWSER },
        meta: { query: q, lang, sort: 'top' },
      })),
    },
    news: {
      pause: 800,
      requests: all.map(({ q, lang }) => ({
        key: `${lang}-${slug(q)}`,
        ext: 'xml',
        url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&${LANGS[lang].news}`,
        headers: browser(lang),
        meta: { query: q, lang },
      })),
    },
    hn: {
      pause: 500,
      requests: [
        {
          key: 'stories-week',
          ext: 'json',
          url: `https://hn.algolia.com/api/v1/search?tags=story&numericFilters=created_at_i%3E${t7},points%3E10&hitsPerPage=1000`,
          headers: { 'user-agent': BROWSER },
          meta: { since: isoDay(weekAgo) },
        },
      ],
    },
    github: {
      pause: 7000,
      requests: [
        ['new-repos', `created:>${isoDay(weekAgo)} stars:>30`],
        ['llm', `topic:llm pushed:>${isoDay(weekAgo)} stars:>200`],
        ['agents', `topic:ai-agents pushed:>${isoDay(weekAgo)} stars:>100`],
        ['mcp', `topic:mcp created:>${isoDay(new Date(now.getTime() - 30 * 86_400_000))}`],
      ]
        .map(([key, q]) => ({
          key,
          ext: 'json',
          url: `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100`,
          headers: { 'user-agent': BROWSER, accept: 'application/vnd.github+json' },
          meta: { query: q },
        }))
        .concat({
          key: 'trending-weekly',
          ext: 'html',
          url: 'https://github.com/trending?since=weekly',
          headers: { 'user-agent': BROWSER },
          meta: {},
        }),
    },
    huggingface: {
      pause: 500,
      requests: [
        ['models', 'https://huggingface.co/api/models?sort=trendingScore&limit=100'],
        ['spaces', 'https://huggingface.co/api/spaces?sort=trendingScore&limit=100'],
        ['papers', 'https://huggingface.co/api/daily_papers?limit=100'],
      ].map(([key, url]) => ({
        key,
        ext: 'json',
        url,
        headers: { 'user-agent': BROWSER },
        meta: {},
      })),
    },
    arxiv: {
      pause: 3000,
      requests: ['cs.AI', 'cs.CL'].map((cat) => ({
        key: slug(cat),
        ext: 'xml',
        url: `https://export.arxiv.org/api/query?search_query=cat:${cat}&sortBy=submittedDate&sortOrder=descending&max_results=100`,
        headers: { 'user-agent': BROWSER },
        meta: { category: cat },
      })),
    },
    newsletters: {
      pause: 500,
      requests: seeds.newsletters.map((url) => ({
        key: slug(new URL(url).hostname + new URL(url).pathname),
        ext: 'xml',
        url,
        headers: { 'user-agent': BROWSER },
        meta: { feed: url },
      })),
    },
    x: {
      pause: 5000,
      requests: seeds.x.map((handle) => ({
        key: slug(handle),
        ext: 'html',
        url: `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
        headers: { 'user-agent': BROWSER },
        meta: { handle },
      })),
    },
    youtube_rss: {
      pause: 800,
      requests: (seeds.youtube ?? []).map((channelId) => ({
        key: channelId,
        ext: 'xml',
        url: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
        headers: { 'user-agent': BROWSER },
        meta: { channelId },
      })),
    },
    instagram: {
      // Instagram answers curl and rate-limits other clients sooner; a long pause keeps it quiet.
      curl: true,
      pause: 45_000,
      requests: seeds.instagram.map((username) => ({
        key: slug(username),
        ext: 'json',
        url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
        headers: { 'user-agent': INSTAGRAM_APP, 'x-ig-app-id': '567067343352427' },
        meta: { username },
      })),
    },
    linkedin: {
      pause: 2500,
      requests: seeds.linkedin.map((company) => ({
        key: slug(company),
        ext: 'html',
        url: `https://www.linkedin.com/company/${company}/`,
        headers: browser('es'),
        meta: { company },
      })),
    },
  };
}

/**
 * GET without fetch's browser headers: Instagram rejects the sec-fetch-* headers that undici adds
 * ("SecFetch Policy violation"). Follows up to three redirects.
 */
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

/** GET through curl: the client Instagram tolerates best from a server. */
function curlGet(url, headers) {
  const args = ['-s', '-m', '30', '-w', '\n%{http_code}', url];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  return new Promise((resolve, reject) => {
    execFile('curl', args, { maxBuffer: 20 * 1024 * 1024, encoding: 'buffer' }, (error, stdout) => {
      if (error) return reject(error);
      const text = stdout.toString('utf8');
      const cut = text.lastIndexOf('\n');
      resolve({
        status: Number(text.slice(cut + 1)),
        body: Buffer.from(text.slice(0, cut), 'utf8'),
      });
    });
  });
}

async function runGroup(dir, source, group) {
  let ok = 0;
  for (const req of group.requests) {
    const capturedAt = new Date().toISOString();
    let status;
    let bytes = 0;
    let file = null;
    try {
      const res = group.curl
        ? await curlGet(req.url, req.headers)
        : await rawGet(req.url, req.headers);
      status = res.status;
      const body = res.body;
      bytes = body.length;
      if (status >= 200 && status < 300 && bytes > 0) {
        file = `${source}/${req.key}.${req.ext}.gz`;
        await mkdir(join(dir, source), { recursive: true });
        await writeFile(join(dir, file), gzipSync(body));
        ok += 1;
      }
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

async function runOnce() {
  const seeds = JSON.parse(await readFile(join(ROOT, 'packages/sources/seeds.json'), 'utf8'));
  const now = new Date();
  const run = now.toISOString().slice(0, 16).replace(':', '-');
  const dir = join(OUT, run);
  await mkdir(dir, { recursive: true });
  const groups = Object.entries(plan(seeds, now)).filter(([s]) => !only || only.includes(s));
  const results = await Promise.all(groups.map(([s, g]) => runGroup(dir, s, g)));
  const line = results.map((r) => `${r.source} ${r.ok}/${r.total}`).join(', ');
  console.log(`[${new Date().toISOString()}] run ${run}: ${line}`);
}

do {
  await runOnce();
  if (every > 0) await sleep(every * 60_000);
} while (every > 0);
