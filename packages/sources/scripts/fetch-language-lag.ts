/**
 * Records how long each AI wave of the backtest took to reach Spanish Wikipedia: the English and
 * Spanish articles' first revisions, and their busiest day of views around the wave.
 *
 *   pnpm --filter @radar/sources exec tsx scripts/fetch-language-lag.ts
 *
 * Writes packages/core/fixtures/backtest/language-lag.json, which `pnpm eval` reads. Wikipedia's
 * public APIs need no key; requests are paced and carry a descriptive User-Agent.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import type { LagArticle, LagWave, LanguageLagFile, WavesFile } from '@radar/core';
import { httpFetch, sleep, wikipediaDaily, type Fetcher } from '../src';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../core/fixtures/backtest');
const UA = 'RadarBacktest/0.1 (hackathon research prototype; public data only)';
const DAY = 86_400_000;
/** An English article created more than this before the wave is an older parent, not its own. */
const SPECIFIC_DAYS = 183;

/** Waves the backtest names without a Wikipedia article: their English title or redirect. */
const TITLES: Record<string, string> = {
  'llama-4': 'Llama 4',
  'claude-code': 'Claude Code',
  'kimi-k2': 'Kimi K2',
  'grok-4': 'Grok 4',
  'genie-3': 'Genie 3',
  'nano-banana': 'Nano Banana',
  'sora-2': 'Sora 2',
};

/** Wikimedia answers 429 when paced too fast: wait and try again instead of losing the series. */
const fetcher: Fetcher = async (url, init) => {
  for (let attempt = 1; ; attempt += 1) {
    const res = await httpFetch(url, { ...init, headers: { ...init?.headers, 'user-agent': UA } });
    if (res.status !== 429 || attempt === 4) return res;
    console.log(`  429 ${url.slice(0, 90)}; espero ${attempt * 20} s`);
    await sleep(attempt * 20_000);
  }
};

async function api<T>(lang: string, params: Record<string, string>): Promise<T> {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`;
  for (let attempt = 1; ; attempt += 1) {
    await sleep(1500);
    const res = await fetcher(url, { headers: { accept: 'application/json' } });
    if (res.status === 200) {
      try {
        return JSON.parse(res.body) as T;
      } catch {
        // «You are making too many requests»: plain text with a 200.
      }
    }
    if (attempt === 4) throw new Error(`${res.status} ${url}`);
    console.log(`  ${res.status} ${lang} ${params.titles}; espero ${attempt * 20} s`);
    await sleep(attempt * 20_000);
  }
}

interface Page {
  title: string;
  missing?: boolean;
  langlinks?: { lang: string; title: string }[];
  revisions?: { timestamp: string }[];
}

/** The article a title lands on, its first revision and its Spanish counterpart. */
async function page(lang: string, title: string, withSpanish: boolean) {
  const data = await api<{ query: { pages: Page[] } }>(lang, {
    action: 'query',
    titles: title,
    prop: withSpanish ? 'revisions|langlinks' : 'revisions',
    rvlimit: '1',
    rvdir: 'newer',
    rvprop: 'timestamp',
    ...(withSpanish ? { lllang: 'es' } : {}),
  });
  const p = data.query.pages[0];
  if (!p || p.missing || !p.revisions?.[0]) return null;
  return { title: p.title, created: p.revisions[0].timestamp, es: p.langlinks?.[0]?.title ?? null };
}

async function peak(lang: string, title: string, event: string) {
  const from = new Date(Date.parse(event) - 30 * DAY).toISOString();
  const to = new Date(Math.min(Date.parse(event) + 90 * DAY, Date.now() - DAY)).toISOString();
  await sleep(1500);
  const days = await wikipediaDaily(lang, title, from, to, { fetcher });
  const top = days.reduce<(typeof days)[number] | null>(
    (best, d) => (best && best.value >= d.value ? best : d),
    null,
  );
  return top ? { date: top.date, views: top.value } : null;
}

const waves = JSON.parse(await readFile(join(DIR, 'waves.json'), 'utf8')) as WavesFile;
const out: LagWave[] = [];
for (const t of waves.topics.filter((t) => t.kind === 'wave')) {
  const event = t.event!;
  const title = t.wikipedia?.find((w) => w.lang === 'en')?.article ?? TITLES[t.id];
  if (!title) {
    console.log(`${t.id}: sin artículo en inglés; se omite`);
    continue;
  }
  const en = await page('en', title, true);
  if (!en) {
    console.log(`${t.id}: ${title} no existe en inglés; se omite`);
    continue;
  }
  const es = en.es ? await page('es', en.es, false) : null;
  const enArticle: LagArticle = {
    title: en.title,
    created: en.created,
    peak: await peak('en', en.title, event),
  };
  const esArticle: LagArticle | null = es
    ? { title: es.title, created: es.created, peak: await peak('es', es.title, event) }
    : null;
  const specific = Date.parse(en.created) >= Date.parse(event) - SPECIFIC_DAYS * DAY;
  out.push({ id: t.id, name: t.name, event, specific, en: enArticle, es: esArticle });
  console.log(
    `${t.id}: en «${en.title}» ${en.created.slice(0, 10)}${specific ? '' : ' (anterior a la ola)'}; es ${es ? `«${es.title}» ${es.created.slice(0, 10)}` : '—'}`,
  );
}

const file: LanguageLagFile = { fetchedAt: new Date().toISOString(), waves: out };
const path = join(DIR, 'language-lag.json');
await writeFile(
  path,
  await format(JSON.stringify(file), { ...(await resolveConfig(path)), parser: 'json' }),
);
console.log(`\n${out.length} olas guardadas en ${path}`);
