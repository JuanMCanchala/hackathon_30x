/**
 * Downloads the history the backtest replays: weekly Wikipedia page views (en and es summed),
 * Hacker News stories and Bluesky posts for every topic in fixtures/backtest/waves.json.
 *
 *   pnpm --filter @radar/core exec tsx scripts/fetch-backtest.ts [--only wikipedia,hn,bluesky] [--force]
 *
 * It resumes: a source already saved for a topic is skipped unless --force. Requests are paced,
 * a refused request is retried twice after a pause, and a series with any missing week is left
 * out rather than saved with holes.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addWeeks, weekRange } from '../src/growth';
import { median } from '../src/stats';
import type { BacktestSeriesFile, WavesFile } from '../src/backtest';
import type { Point } from '../src/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '../fixtures/backtest');
const UA = 'RadarBacktest/0.1 (hackathon research prototype; public data only)';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]!.split(',') : null;
const force = args.includes('--force');
// A second process can walk the topics from the end to halve a slow fetch; finished topics are skipped.
const reverse = args.includes('--reverse');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

async function getJson<T>(url: string, tries = 3, pause = 20_000): Promise<T | null> {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 404) return null;
      const text = await res.text();
      if (res.ok && text) return JSON.parse(text) as T;
      log(`  ${res.status} ${url.slice(0, 120)} (intento ${attempt})`);
    } catch (error) {
      log(`  error ${String(error).slice(0, 80)} ${url.slice(0, 100)} (intento ${attempt})`);
    }
    if (attempt < tries) await sleep(pause * attempt);
  }
  return null;
}

/** Runs `tasks` with at most `limit` in flight, each start spaced by `spacing` ms. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number, spacing: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]!();
      await sleep(spacing);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

const unix = (week: string) => Math.floor(Date.parse(`${week}T00:00:00Z`) / 1000);
const phrase = (q: string) => (q.includes(' ') && !q.startsWith('"') ? `"${q}"` : q);

async function wikipediaWeekly(
  articles: { lang: string; article: string }[],
  weeks: string[],
  from: string,
  to: string,
): Promise<BacktestSeriesFile['wikipedia'] | null> {
  // Views per day, en and es summed.
  const daily = new Map<string, number>();
  const used: { lang: string; title: string }[] = [];
  const views = (lang: string, title: string) =>
    getJson<{ items: { timestamp: string; views: number }[] }>(
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${from.replace(/-/g, '')}/${to.replace(/-/g, '')}`,
    );
  for (const { lang, article } of articles) {
    // The page views API answers by exact title; only when it does not know the title is the
    // (stricter, rate-limited) action API asked for the canonical one behind a redirect.
    let title = article;
    let data = await views(lang, title);
    if (!data) {
      const resolve = await getJson<{
        query: { pages: Record<string, { title: string; missing?: string }> };
      }>(
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=${encodeURIComponent(article)}`,
      );
      const page = resolve && Object.values(resolve.query.pages)[0];
      if (!page || page.missing !== undefined) {
        log(`  wikipedia ${lang}:${article} no existe; se omite`);
        continue;
      }
      title = page.title;
      data = await views(lang, title);
    }
    if (!data) {
      log(`  wikipedia ${lang}:${title} sin datos; se omite`);
      continue;
    }
    for (const item of data.items) {
      const day = `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`;
      daily.set(day, (daily.get(day) ?? 0) + item.views);
    }
    used.push({ lang, title });
    await sleep(300);
  }
  if (!used.length) return null;
  // A week's level is its median day × 7, not its sum. Wikipedia counts some automated traffic as
  // people: one- or two-day spikes hit unrelated articles at once (Kubernetes, PostgreSQL and
  // Docker on 2026-07-28). The median, like counting distinct creators, cannot be moved by one
  // actor in one day; a wave that lasts several days still moves it.
  const weekly = weeks.map((w) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.parse(`${w}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
      return daily.get(d) ?? 0;
    });
    return { date: w, value: Math.round(median(days) * 7) };
  });
  return { articles: used, weekly };
}

async function hnWeekly(query: string, weeks: string[]): Promise<Point[] | null> {
  const q = encodeURIComponent(phrase(query));
  const values = await pool(
    weeks.map((w) => async () => {
      const data = await getJson<{ nbHits: number }>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${q}&tags=story&numericFilters=created_at_i%3E%3D${unix(w)},created_at_i%3C${unix(addWeeks(w, 1))}&hitsPerPage=0`,
        3,
        5_000,
      );
      return data ? data.nbHits : null;
    }),
    4,
    150,
  );
  if (values.some((v) => v === null)) return null;
  return weeks.map((w, i) => ({ date: w, value: values[i]! }));
}

async function blueskyWeekly(query: string, weeks: string[]): Promise<Point[] | null> {
  const values: number[] = [];
  for (const w of weeks) {
    const data = await getJson<{ hitsTotal?: number }>(
      `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&since=${w}T00:00:00Z&until=${addWeeks(w, 1)}T00:00:00Z&limit=1`,
      3,
      30_000,
    );
    if (!data || typeof data.hitsTotal !== 'number') return null;
    values.push(data.hitsTotal);
    await sleep(1_200);
  }
  return weeks.map((w, i) => ({ date: w, value: values[i]! }));
}

async function main() {
  const waves = JSON.parse(await readFile(join(DIR, 'waves.json'), 'utf8')) as WavesFile;
  const weeks = weekRange(waves.window.from, waves.window.to);
  // Only whole weeks: the last one stays only if `to` is its Sunday.
  const lastSunday = new Date(Date.parse(`${weeks.at(-1)}T00:00:00Z`) + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (lastSunday > waves.window.to) weeks.pop();
  await mkdir(join(DIR, 'series'), { recursive: true });
  log(`${waves.topics.length} temas, ${weeks.length} semanas (${weeks[0]} → ${weeks.at(-1)})`);

  for (const source of ['wikipedia', 'hn', 'bluesky'] as const) {
    if (only && !only.includes(source)) continue;
    for (const topic of reverse ? [...waves.topics].reverse() : waves.topics) {
      const file = join(DIR, 'series', `${topic.id}.json`);
      const saved: BacktestSeriesFile = existsSync(file)
        ? (JSON.parse(await readFile(file, 'utf8')) as BacktestSeriesFile)
        : { id: topic.id, name: topic.name, kind: topic.kind, weeks: weeks.length };
      if (saved[source] && !force) continue;
      if (source === 'wikipedia' && topic.wikipedia?.length) {
        const series = await wikipediaWeekly(topic.wikipedia, weeks, weeks[0]!, waves.window.to);
        if (series) saved.wikipedia = series;
      } else if (source === 'hn' && topic.hn) {
        const weekly = await hnWeekly(topic.hn, weeks);
        if (weekly) saved.hn = { query: topic.hn, weekly };
        else log(`  hn ${topic.id}: incompleta; se omite`);
      } else if (source === 'bluesky' && topic.bluesky) {
        const weekly = await blueskyWeekly(topic.bluesky, weeks);
        if (weekly) saved.bluesky = { query: topic.bluesky, weekly };
        else log(`  bluesky ${topic.id}: incompleta; se omite`);
      } else {
        continue;
      }
      saved.fetchedAt = new Date().toISOString();
      await writeFile(file, `${JSON.stringify(saved, null, 2)}\n`);
      log(`${source} ${topic.id}: ${saved[source] ? 'listo' : 'sin datos'}`);
    }
  }
  log('fin');
}

await main();
