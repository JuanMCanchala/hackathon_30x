/**
 * «Vigía»: follow a topic and catch what goes viral about it in English and Portuguese, where
 * viral content usually starts, so the team can adapt it to Spanish before anyone else.
 *
 * Every search is a funnel. The scrapers bring candidates and spend no tokens; the rules in
 * @radar/core decide which are in the language, about the topic, recent, viral and new, each with
 * its reason in words; only the best, up to a budget per search, spend tokens: the idea in
 * Spanish, the text of every carousel slide and the key points of every video.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { and, desc, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  SCREEN_RULES,
  engagementOf,
  median,
  mentions,
  screen,
  type RawItem,
  type ScreenCandidate,
  type ScreenLang,
  type ScreenRule,
  type ScreenVerdict,
} from '@radar/core';
import {
  YOUTUBE_VIDEOS_BATCH,
  dedupe,
  fetchYoutubeVideos,
  httpFetch,
  itemKey,
  listRuns,
  parsers,
  readIndex,
  readPublicPost,
  runSearch,
  searchRequests,
  sleep,
  withYoutubeVideos,
  type Fetcher,
} from '@radar/sources';
import type { Config } from '../config';
import { enrichments, items, llmUsage, runs, watchHits, watchRuns, watches } from '../db/schema';
import { JEV_USD_PER_MTOK, JevUnavailableError } from '../jev/client';
import { AppError, conflict, iso, newId, notFound } from '../lib/common';
import { langOf } from '../lib/lang';
import { saveItems } from '../pipeline/ingest';
import { AdaptationSchema, VOICE, type AdaptationContent } from './adapt';
import { nowIso, type Deps } from './deps';
import { IMPORTED } from './snapshot';
import { pieceView } from './topic';
import { toSpanish } from './translate';

/** The languages a followed topic catches: where viral content about AI usually starts. */
export const WATCH_LANGS = ['en', 'pt'] as const;
type WatchLang = (typeof WATCH_LANGS)[number];
/** Slides read per carousel, at most: the first ten tell the story. */
const MAX_SLIDES = 10;
/** Feeds older than this are not worth searching: the capture refreshes them every two hours. */
const FEED_RUNS = 30;

const PlanSchema = z.object({
  en: z.object({ queries: z.array(z.string()), match: z.array(z.string()) }),
  pt: z.object({ queries: z.array(z.string()), match: z.array(z.string()) }),
});
export type WatchPlan = z.infer<typeof PlanSchema>;

const PLAN_SYSTEM = `Preparas la búsqueda de un tema que el equipo de contenido de 30X (escuela de negocios latinoamericana que enseña IA a ejecutivos) quiere seguir en inglés y en portugués: lo viral suele nacer en esos idiomas y llega días después al español.

Para cada idioma (en, pt) devuelve:
- queries: 3 búsquedas cortas (2 a 4 palabras), como las escribiría alguien en YouTube o Bluesky para encontrar lo más reciente y popular del tema. Una de ellas lo cruza con IA si el tema no la menciona.
- match: de 5 a 10 palabras o frases en minúscula que una pieza tiene que mencionar para ser del tema: el tema traducido, sus plurales y sinónimos cercanos. Nada genérico como "ai", "new" o "2026".`;

const SlidesSchema = z.object({
  slides: z.array(z.object({ text: z.string(), es: z.string() })),
  idea: z.string(),
});

const SLIDES_SYSTEM = `Lees las láminas de un carrusel de Instagram que funcionó en otro idioma, para que el equipo de contenido de 30X lo adapte al español. Para cada lámina, en orden: "text" es el texto visible tal como está (vacío si no tiene) y "es" su sentido en español latinoamericano, no palabra por palabra. "idea": en una frase en español, qué cuenta el carrusel y por qué engancha.`;

const VideoSchema = z.object({
  hook: z.string(),
  points: z.array(z.string()),
  idea: z.string(),
});

const VIDEO_SYSTEM = `Lees la transcripción de un video que funcionó en otro idioma, para que el equipo de contenido de 30X lo adapte al español. Devuelve en español latinoamericano: "hook", lo que dice en los primeros segundos para enganchar; "points", de 3 a 5 ideas clave en el orden del video, una frase cada una; "idea", qué cuenta y por qué funciona, en una frase. Usa solo lo que está en la transcripción.`;

const ADAPT_PIECE_SYSTEM = `Eres editor de contenido de 30X. Te damos una pieza que se volvió viral en inglés o en portugués: su texto, y si es carrusel o video, lo que dice cada lámina o sus ideas clave. Adáptala al español latinoamericano para que una persona del equipo la revise y publique.

${VOICE}

Toma la idea y el gancho, no traduzcas palabra por palabra; cambia los ejemplos por casos de la región. Devuelve:
- angle: el ángulo propio de 30X en una frase.
- hooks: 3 ganchos para abrir, máximo 15 palabras cada uno.
- linkedin: post para LinkedIn con la voz de Andrés Bilbao, de 120 a 220 palabras, con saltos de línea, máximo 3 hashtags al final.
- carousel: de 6 a 8 láminas (título de máximo 8 palabras y texto de máximo 30); si la original es un carrusel, sigue su estructura.
- reel: guion de 30 a 45 segundos: hook, beats (4 a 6), onScreen (texto en pantalla de cada beat) y cta.
- youtube: título (máximo 70 caracteres) e idea de miniatura.
- avoid: 2 o 3 cosas que no conviene copiar de la original.
- inspiredBy: una lista con el id de la pieza original.

Usa solo hechos que estén en la pieza o sean de conocimiento general. Español latinoamericano neutro, sin markdown.`;

export interface WatchSource {
  source: string;
  lang: WatchLang | null;
  region?: string;
  query: string;
  status: number;
  found: number;
}

export interface WatchReport {
  /** How many pieces were still in after each rule, from everything the scrapers found. */
  steps: { step: 'encontradas' | ScreenRule; left: number }[];
  sources: WatchSource[];
  /** Per rule, how many it stopped and a few of them with the reason. */
  rejected: { rule: ScreenRule; count: number; examples: { title: string; reason: string }[] }[];
  caught: number;
  costUsd: number;
  tokens: { input: number; output: number };
  /** What JEV judged before the screen, or why it did not. Older runs have none. */
  jev?: { judged: number; inputTokens: number; ms: number; costUsd: number } | { skipped: string };
}

/** The most engaged pieces that passed language and date are the ones JEV is asked about. */
export const JEV_MAX_PIECES = 120;

export interface Slide {
  n: number;
  /** Served by GET /api/v1/media/:item/:n. */
  image: string;
  text: string;
  es: string;
}

export interface Capture {
  /** The piece's opening line, or its title, in Spanish. */
  es: string | null;
  slides?: Slide[];
  video?: { hook: string; points: string[]; transcriptChars: number } | null;
  /** What the carousel or video tells and why it hooks, in Spanish. */
  idea?: string | null;
}

// ------------------------------------------------------------------ follow

const TermBody = z.string().trim().min(2).max(60);

/** Each followed topic searches every hour and spends model and JEV calls: a few are enough. */
export const MAX_ACTIVE_WATCHES = 5;

export async function createWatch(deps: Deps, term: string) {
  const clean = TermBody.parse(term);
  const [active] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(watches)
    .where(eq(watches.active, true));
  if ((active?.n ?? 0) >= MAX_ACTIVE_WATCHES)
    throw conflict(
      `Ya sigues ${MAX_ACTIVE_WATCHES} temas, el máximo. Deja de seguir uno para agregar otro.`,
    );
  const plan = await deps.llm.complete({
    name: 'watch-plan',
    system: PLAN_SYSTEM,
    user: `Tema: ${clean}`,
    schema: PlanSchema,
    maxTokens: 1200,
    reasoningEffort: 'none',
  });
  const row = {
    id: newId('wch'),
    term: clean,
    plan,
    langs: [...WATCH_LANGS],
    windowHours: 72,
    everyMinutes: 60,
    budget: 12,
    active: true,
    createdAt: nowIso(deps),
    lastRunAt: null,
  };
  await deps.db.insert(watches).values(row);
  return row;
}

/**
 * A topic the demo week came with (followed before its snapshot was loaded). Visitors stop the
 * ones they followed; only an admin stops these.
 */
export async function isDemoWatch(deps: Deps, id: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ createdAt: watches.createdAt, loadedAt: runs.startedAt })
    .from(watches)
    .innerJoin(runs, eq(runs.id, IMPORTED.id))
    .where(eq(watches.id, id));
  return !!row && Date.parse(row.createdAt) <= Date.parse(row.loadedAt);
}

export async function stopWatch(deps: Deps, id: string) {
  const deleted = await deps.db.delete(watches).where(eq(watches.id, id)).returning();
  if (!deleted.length) throw notFound('El tema');
  return { ok: true };
}

// ------------------------------------------------------------------ search

const running = new Set<string>();

export const isRunning = (id: string) => running.has(id);

/** The newest public feed of each Instagram profile the capture follows, with every slide. */
async function instagramFeeds(rawDir: string): Promise<RawItem[]> {
  const runs = (await listRuns(rawDir)).reverse().slice(0, FEED_RUNS);
  const seen = new Set<string>();
  const out: RawItem[] = [];
  const parse = parsers.instagram!;
  for (const dir of runs) {
    let records: Awaited<ReturnType<typeof readIndex>>;
    try {
      records = await readIndex(dir);
    } catch {
      continue;
    }
    for (const record of records) {
      if (record.source !== 'instagram' || !record.file || seen.has(record.key)) continue;
      seen.add(record.key);
      try {
        out.push(
          ...parse(gunzipSync(await readFile(join(dir, record.file))).toString('utf8'), record),
        );
      } catch {
        // A truncated capture is skipped; the next one will have the profile.
      }
    }
  }
  return out;
}

async function collect(
  deps: Deps,
  w: typeof watches.$inferSelect,
  now: Date,
  fetcher: Fetcher,
  pauseMs: number,
): Promise<{ raws: RawItem[]; sources: WatchSource[] }> {
  const plan = w.plan as WatchPlan;
  const sources: WatchSource[] = [];
  const raws: RawItem[] = [];
  for (const lang of w.langs as WatchLang[]) {
    for (const query of plan[lang].queries.slice(0, 3)) {
      for (const request of searchRequests(query, lang, now, w.windowHours)) {
        const result = await runSearch(fetcher, request, now.toISOString());
        sources.push({
          source: request.source,
          lang,
          region: request.region,
          query,
          status: result.status,
          found: result.items.length,
        });
        raws.push(...result.items);
        if (pauseMs) await sleep(pauseMs);
      }
    }
  }
  const feeds = await instagramFeeds(deps.config.RAW_DIR);
  sources.push({
    source: 'instagram',
    lang: null,
    query: 'perfiles que sigue OndAI',
    status: 200,
    found: feeds.length,
  });
  raws.push(...feeds);
  const completed = await completeYoutube(
    dedupe(raws),
    plan,
    w.langs as WatchLang[],
    fetcher,
    pauseMs,
    deps.config.YOUTUBE_API_KEY,
  );
  if (completed.fromApi !== null)
    sources.push({
      source: 'youtube-api',
      lang: null,
      query: 'fecha, canal y métricas exactas de la API oficial (videos.list)',
      status: 200,
      found: completed.fromApi,
    });
  if (completed.opened)
    sources.push({
      source: 'youtube-detalle',
      lang: null,
      query: 'videos abiertos para leer fecha, canal y métricas',
      status: 200,
      found: completed.opened,
    });
  return { raws: dropCopies(completed.raws), sources };
}

/** Each author's median engagement over their other pieces in the radar (three or more). */
async function authorMedians(deps: Deps, raws: RawItem[]) {
  const authors = [...new Set(raws.map((r) => `${r.platform}:${r.author.id}`))];
  const rows = authors.length
    ? await deps.db
        .select({
          id: items.id,
          platform: items.platform,
          authorId: items.authorId,
          engagement: items.engagement,
        })
        .from(items)
        .where(inArray(sql<string>`${items.platform} || ':' || ${items.authorId}`, authors))
    : [];
  const byAuthor = new Map<string, { id: string; engagement: number }[]>();
  for (const r of rows) {
    const k = `${r.platform}:${r.authorId}`;
    byAuthor.set(k, [...(byAuthor.get(k) ?? []), { id: r.id, engagement: r.engagement }]);
  }
  // The feeds just read count too: a profile's twelve latest posts are its own baseline.
  for (const r of raws) {
    const k = `${r.platform}:${r.author.id}`;
    const list = byAuthor.get(k) ?? [];
    if (!list.some((x) => x.id === itemKey(r)))
      list.push({ id: itemKey(r), engagement: engagementOf(r.metrics, r.platform) });
    byAuthor.set(k, list);
  }
  return (r: RawItem): number | null => {
    // Without an author there is no baseline: pieces with no name are not one author.
    if (!r.author.id) return null;
    const others = (byAuthor.get(`${r.platform}:${r.author.id}`) ?? []).filter(
      (x) => x.id !== itemKey(r),
    );
    return others.length >= 3 ? median(others.map((x) => x.engagement)) : null;
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where the topic has to show up: the title and the opening of the text, the hook, without the
 * author's own name («Business Insider» is not about business).
 */
function hookOf(r: RawItem): string {
  // Links do not count: «swissre.com/our-business» is not a post about business.
  let text = [r.title, r.text.slice(0, 280)]
    .filter(Boolean)
    .join('\n')
    .replace(/(https?:\/\/|www\.)\S+/gi, ' ');
  for (const name of [r.author.name, r.author.handle]) {
    if (name && name.length > 2) text = text.replace(new RegExp(escapeRe(name), 'gi'), ' ');
  }
  return text;
}

/** One piece per title and platform: re-uploads and copies keep only the most engaged one. */
function dropCopies(raws: RawItem[]): RawItem[] {
  const best = new Map<string, RawItem>();
  for (const r of raws) {
    const title = (r.title || r.text.slice(0, 120))
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
    const k = title.length >= 12 ? `${r.platform}:${title}` : itemKey(r);
    const prev = best.get(k);
    if (!prev || engagementOf(r.metrics, r.platform) > engagementOf(prev.metrics, prev.platform))
      best.set(k, r);
  }
  return [...best.values()];
}

/** Videos a search page shows without date or channel: up to this many are opened, for free. */
const YOUTUBE_DETAILS = 40;

/**
 * YouTube's search page leaves out the date and channel of shorts and rounds the rest («hace 2
 * días»). The videos that could pass (in the language, about the topic) are opened one by one,
 * most viewed first, to read their exact date, channel, likes, comments and subscribers. No tokens.
 * With a YouTube API key, one videos.list call (1 quota unit) reads the 50 most viewed instead.
 */
async function completeYoutube(
  raws: RawItem[],
  plan: WatchPlan,
  langs: WatchLang[],
  fetcher: Fetcher,
  pauseMs: number,
  key?: string,
): Promise<{ raws: RawItem[]; opened: number; fromApi: number | null }> {
  const worth = raws
    .filter((r) => r.platform === 'youtube' && (r.publishedApprox || !r.author.id))
    .filter((r) => {
      const lang = langOf(r);
      return (
        lang !== null &&
        (langs as ScreenLang[]).includes(lang) &&
        mentions(hookOf(r), plan[lang as WatchLang].match) !== null
      );
    })
    .sort((a, b) => (b.metrics.views ?? 0) - (a.metrics.views ?? 0))
    .slice(0, key ? YOUTUBE_VIDEOS_BATCH : YOUTUBE_DETAILS);
  if (key) {
    const videos = await fetchYoutubeVideos(
      worth.map((r) => r.externalId),
      key,
      fetcher,
    );
    return { raws: withYoutubeVideos(raws, videos), opened: 0, fromApi: videos.size };
  }
  const detailed = new Map<string, RawItem>();
  for (const r of worth) {
    const read = await readPublicPost(r.url, { fetcher, now: r.capturedAt }).catch(() => null);
    if (read)
      detailed.set(itemKey(r), {
        ...read,
        source: r.source,
        query: r.query,
        format: r.format === 'short' ? 'short' : read.format,
        lang: r.lang,
      });
    if (pauseMs) await sleep(Math.min(pauseMs, 250));
  }
  return {
    raws: raws.map((r) => detailed.get(itemKey(r)) ?? r),
    opened: worth.length,
    fromApi: null,
  };
}

const mediaDir = (deps: Deps, id: string) =>
  join(deps.config.DATA_DIR, 'media', id.replace(/[^\w-]/g, '_'));

/** Downloads every slide (Instagram signs its links for a few days) and reads them in one call. */
async function readSlides(deps: Deps, raw: RawItem): Promise<Pick<Capture, 'slides' | 'idea'>> {
  const id = itemKey(raw);
  const dir = mediaDir(deps, id);
  await mkdir(dir, { recursive: true });
  const images: { n: number; dataUrl: string }[] = [];
  const pictures = (raw.media ?? []).filter((m) => m.kind === 'image').slice(0, MAX_SLIDES);
  for (const [i, m] of pictures.entries()) {
    try {
      const res = await fetch(m.url);
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(join(dir, `${i + 1}.jpg`), buffer);
      images.push({ n: i + 1, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` });
    } catch {
      // A slide that does not download is left out; the rest still tell the story.
    }
  }
  if (!images.length) return { slides: [], idea: null };
  const image = (n: number) => `/api/v1/media/${encodeURIComponent(id)}/${n}`;
  try {
    const read = await deps.llm.complete({
      name: 'watch-slides',
      system: SLIDES_SYSTEM,
      user: `Carrusel de @${raw.author.handle ?? raw.author.name} con ${images.length} láminas, en orden. Texto del post: ${raw.text.slice(0, 600)}`,
      images: images.map((i) => i.dataUrl),
      schema: SlidesSchema,
      maxTokens: 4000,
      reasoningEffort: 'none',
    });
    return {
      slides: images.map((img, i) => ({
        n: img.n,
        image: image(img.n),
        text: read.slides[i]?.text ?? '',
        es: read.slides[i]?.es ?? '',
      })),
      idea: read.idea,
    };
  } catch (error) {
    console.error('vigía, láminas:', (error as Error).message);
    return { slides: images.map((img) => ({ n: img.n, image: image(img.n), text: '', es: '' })) };
  }
}

/** The auto-generated subtitles of a YouTube video, as plain text; null when it has none. */
async function youtubeTranscript(id: string, lang: string): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'radar-subs-'));
  try {
    await new Promise<void>((resolve) => {
      execFile(
        'yt-dlp',
        [
          '--skip-download',
          '--write-auto-subs',
          '--write-subs',
          '--sub-langs',
          `${lang}.*,${lang}`,
          '--sub-format',
          'json3',
          '-o',
          join(dir, '%(id)s'),
          `https://www.youtube.com/watch?v=${id}`,
        ],
        { timeout: 60_000 },
        () => resolve(),
      );
    });
    const file = (await readdir(dir)).find((f) => f.endsWith('.json3'));
    if (!file) return null;
    const data = JSON.parse(await readFile(join(dir, file), 'utf8')) as {
      events?: { segs?: { utf8?: string }[] }[];
    };
    const text = (data.events ?? [])
      .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? '').join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A video's opening hook and key points in Spanish, from its subtitles; null without them. */
async function readVideo(
  deps: Deps,
  raw: RawItem,
  lang: string,
): Promise<Pick<Capture, 'video' | 'idea'> | null> {
  const transcript = await youtubeTranscript(raw.externalId, lang);
  if (!transcript) return null;
  const read = await deps.llm.complete({
    name: 'watch-video',
    system: VIDEO_SYSTEM,
    user: `Título: ${raw.title ?? ''}\n\nTranscripción:\n${transcript.slice(0, 14_000)}`,
    schema: VideoSchema,
    maxTokens: 1500,
    reasoningEffort: 'none',
  });
  return {
    video: { hook: read.hook, points: read.points, transcriptChars: transcript.length },
    idea: read.idea,
  };
}

/** One search of a followed topic, start to end. Searches of the same topic never overlap. */
export async function runWatch(
  deps: Deps,
  id: string,
  options: { fetcher?: Fetcher; pauseMs?: number } = {},
) {
  const [w] = await deps.db.select().from(watches).where(eq(watches.id, id));
  if (!w) throw notFound('El tema');
  if (running.has(id)) throw new AppError(409, 'watch_running', 'Ya está buscando este tema.');
  running.add(id);
  const runId = newId('wrn');
  const startedAt = nowIso(deps);
  await deps.db.insert(watchRuns).values({ id: runId, watchId: id, startedAt });
  deps.bus.publish({ type: 'watch.changed', at: startedAt, data: { id } });
  try {
    const now = deps.clock.now();
    const { raws, sources } = await collect(
      deps,
      w,
      now,
      options.fetcher ?? httpFetch,
      options.pauseMs ?? 400,
    );
    const byKey = new Map(raws.map((r) => [itemKey(r), r]));
    const medianOf = await authorMedians(deps, raws);
    const seen = new Set(
      (
        await deps.db
          .select({ itemId: watchHits.itemId })
          .from(watchHits)
          .where(eq(watchHits.watchId, id))
      ).map((h) => h.itemId),
    );
    const candidates: ScreenCandidate[] = raws.map((r) => ({
      key: itemKey(r),
      platform: r.platform,
      lang: langOf(r),
      text: hookOf(r),
      publishedAt: r.publishedAt,
      // A short whose page could not be opened has no date at all, only the moment we saw it.
      dateKnown: !(r.platform === 'youtube' && r.publishedApprox && !r.author.id),
      engagement: engagementOf(r.metrics, r.platform),
      authorMedian: medianOf(r),
    }));
    const plan = w.plan as WatchPlan;
    const { judged, jev } = await judgeWithJev(deps, w.term, candidates, byKey, {
      now: now.getTime(),
      seen,
      langs: w.langs as WatchLang[],
      windowHours: w.windowHours,
    });
    const result = screen(candidates, {
      now: now.toISOString(),
      langs: w.langs as WatchLang[],
      match: { en: plan.en.match, pt: plan.pt.match },
      windowHours: w.windowHours,
      budget: w.budget,
      seen,
      judged,
    });

    // Only what passed every rule reaches the model.
    const caught = result.caught.map((d) => ({ d, raw: byKey.get(d.key)! }));
    await saveItems(
      deps,
      caught.map((c) => c.raw),
    );
    const es = await toSpanish(
      deps,
      caught.map(({ d, raw }) => ({ id: d.key, text: raw.title || raw.text })),
      'watch-translate',
    );
    for (const { d, raw } of caught) {
      const lang = candidates.find((c) => c.key === d.key)!.lang!;
      const capture: Capture = { es: es.get(d.key) ?? null };
      if (raw.platform === 'instagram' && raw.format === 'carousel' && raw.media?.length) {
        Object.assign(capture, await readSlides(deps, raw));
      } else if (raw.platform === 'youtube') {
        const read = await readVideo(deps, raw, lang).catch(() => null);
        capture.video = read?.video ?? null;
        capture.idea = read?.idea ?? null;
      }
      await deps.db
        .insert(watchHits)
        .values({
          watchId: id,
          itemId: d.key,
          runId,
          foundAt: nowIso(deps),
          lang,
          score: d.score,
          reasons: d.reasons,
          capture,
        })
        .onConflictDoNothing();
    }

    const usage = await deps.db
      .select({
        cost: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)`,
        input: sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)`,
        output: sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)`,
      })
      .from(llmUsage)
      .where(and(like(llmUsage.name, 'watch-%'), gte(llmUsage.at, startedAt)));
    const report: WatchReport = {
      steps: result.funnel,
      sources,
      rejected: SCREEN_RULES.map((rule) => {
        const stopped = result.decisions.filter((x) => x.failed === rule);
        return {
          rule,
          count: stopped.length,
          examples: stopped.slice(0, 3).map((x) => {
            const raw = byKey.get(x.key)!;
            return {
              title: (raw.title || raw.text).replace(/\s+/g, ' ').slice(0, 110),
              reason: x.reasons[0] ?? '',
            };
          }),
        };
      }),
      caught: caught.length,
      costUsd: Number(usage[0]?.cost ?? 0),
      tokens: { input: Number(usage[0]?.input ?? 0), output: Number(usage[0]?.output ?? 0) },
      jev,
    };
    const finishedAt = nowIso(deps);
    await deps.db.update(watchRuns).set({ finishedAt, report }).where(eq(watchRuns.id, runId));
    await deps.db.update(watches).set({ lastRunAt: finishedAt }).where(eq(watches.id, id));
    return report;
  } catch (error) {
    const message = (error as Error).message.slice(0, 500);
    await deps.db
      .update(watchRuns)
      .set({ finishedAt: nowIso(deps), error: message })
      .where(eq(watchRuns.id, runId));
    await deps.db
      .update(watches)
      .set({ lastRunAt: nowIso(deps) })
      .where(eq(watches.id, id));
    throw error;
  } finally {
    running.delete(id);
    deps.bus.publish({ type: 'watch.changed', at: nowIso(deps), data: { id } });
  }
}

/**
 * Asks JEV about the pieces that can still be caught (right language, known and recent date), the
 * most engaged first, before the screen runs. Without JEV, or when it fails, the screen decides
 * the topic by keywords as before, and the report says why.
 */
async function judgeWithJev(
  deps: Deps,
  term: string,
  candidates: readonly ScreenCandidate[],
  byKey: ReadonlyMap<string, RawItem>,
  opts: {
    now: number;
    seen: ReadonlySet<string>;
    langs: readonly WatchLang[];
    windowHours: number;
  },
): Promise<{
  judged: Map<string, ScreenVerdict> | undefined;
  jev: NonNullable<WatchReport['jev']>;
}> {
  if (!deps.jev) return { judged: undefined, jev: { skipped: 'sin llave' } };
  const pieces = candidates
    .filter(
      (c) =>
        c.lang !== null &&
        (opts.langs as readonly string[]).includes(c.lang) &&
        c.dateKnown !== false &&
        // Already caught, or without a single interaction: the screen stops them anyway.
        !opts.seen.has(c.key) &&
        c.engagement > 0 &&
        opts.now - new Date(c.publishedAt).getTime() <= opts.windowHours * 3_600_000,
    )
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, JEV_MAX_PIECES)
    .map((c) => ({
      key: c.key,
      platform: c.platform,
      lang: c.lang!,
      text: c.text,
      author: byKey.get(c.key)?.author.name ?? '',
    }));
  try {
    const { verdicts, inputTokens, ms } = await deps.jev.judge(term, pieces);
    return {
      judged: verdicts,
      jev: {
        judged: verdicts.size,
        inputTokens,
        ms,
        costUsd: (inputTokens * JEV_USD_PER_MTOK) / 1e6,
      },
    };
  } catch (error) {
    const reason = error instanceof JevUnavailableError ? error.message : 'JEV falló';
    console.error('jev:', reason);
    return { judged: undefined, jev: { skipped: reason } };
  }
}

/** Starts a search without waiting for it; failures are logged, not thrown. */
export function runWatchInBackground(deps: Deps, id: string) {
  if (running.has(id)) return false;
  void runWatch(deps, id).catch((error) => console.error('vigía:', (error as Error).message));
  return true;
}

/** Searches every followed topic when its turn comes. Returns a function that stops it. */
/**
 * The demo week is frozen: a scheduled search would add pieces to it on its own. «Buscar ahora»
 * still runs a followed topic by hand.
 */
export function watchSchedulerEnabled(config: Config): boolean {
  return config.WATCH_SCHEDULER ?? !config.DEMO_MODE;
}

export function startWatchScheduler(deps: Deps, everyMs = 60_000): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const due = await deps.db
        .select()
        .from(watches)
        .where(
          and(
            eq(watches.active, true),
            sql`(${watches.lastRunAt} is null or ${watches.lastRunAt} + ${watches.everyMinutes} * interval '1 minute' <= now())`,
          ),
        );
      for (const w of due) {
        if (running.has(w.id)) continue;
        await runWatch(deps, w.id).catch((error) =>
          console.error('vigía:', (error as Error).message),
        );
      }
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}

// ------------------------------------------------------------------ read

export async function listWatches(deps: Deps) {
  const rows = await deps.db.select().from(watches).orderBy(desc(watches.createdAt));
  const counts = await deps.db
    .select({ watchId: watchHits.watchId, n: sql<number>`count(*)` })
    .from(watchHits)
    .groupBy(watchHits.watchId);
  return rows.map((w) => ({
    id: w.id,
    term: w.term,
    caught: Number(counts.find((c) => c.watchId === w.id)?.n ?? 0),
    lastRunAt: iso(w.lastRunAt),
    running: running.has(w.id),
  }));
}

export async function watchDetail(deps: Deps, id: string) {
  const [w] = await deps.db.select().from(watches).where(eq(watches.id, id));
  if (!w) throw notFound('El tema');
  const [run] = await deps.db
    .select()
    .from(watchRuns)
    .where(eq(watchRuns.watchId, id))
    .orderBy(desc(watchRuns.startedAt))
    .limit(1);
  const lastDone = run?.finishedAt
    ? run
    : (
        await deps.db
          .select()
          .from(watchRuns)
          .where(and(eq(watchRuns.watchId, id), sql`${watchRuns.finishedAt} is not null`))
          .orderBy(desc(watchRuns.startedAt))
          .limit(1)
      )[0];
  const hits = await deps.db
    .select({ hit: watchHits, item: items, e: enrichments })
    .from(watchHits)
    .innerJoin(items, eq(items.id, watchHits.itemId))
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(eq(watchHits.watchId, id))
    .orderBy(desc(watchHits.foundAt), desc(watchHits.score))
    .limit(80);
  const next = w.lastRunAt
    ? new Date(new Date(w.lastRunAt).getTime() + w.everyMinutes * 60_000).toISOString()
    : null;
  return {
    watch: {
      id: w.id,
      term: w.term,
      plan: w.plan as WatchPlan,
      langs: w.langs as WatchLang[],
      windowHours: w.windowHours,
      everyMinutes: w.everyMinutes,
      budget: w.budget,
      // Timestamp columns read back as Postgres text, which Safari cannot parse.
      lastRunAt: iso(w.lastRunAt),
      nextRunAt: next,
      running: running.has(w.id),
    },
    run: lastDone
      ? {
          startedAt: iso(lastDone.startedAt),
          finishedAt: iso(lastDone.finishedAt),
          report: lastDone.report as WatchReport | null,
          error: lastDone.error,
        }
      : null,
    hits: hits.map(({ hit, item, e }) => ({
      piece: pieceView(item, e, null),
      lang: hit.lang as WatchLang,
      score: hit.score,
      reasons: hit.reasons as string[],
      foundAt: iso(hit.foundAt),
      capture: hit.capture as Capture | null,
      adaptation: hit.adaptation as AdaptationContent | null,
    })),
  };
}

/** A caught slide, from the copy kept when it was caught. */
export async function mediaFile(deps: Deps, itemId: string, n: number): Promise<Buffer> {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SLIDES) throw notFound('La imagen');
  try {
    return await readFile(join(mediaDir(deps, itemId), `${n}.jpg`));
  } catch {
    throw notFound('La imagen');
  }
}

// ------------------------------------------------------------------ adapt

/** The caught piece in Spanish, in 30X's voice and formats. */
export async function adaptHit(deps: Deps, watchId: string, itemId: string, variant = 0) {
  const [row] = await deps.db
    .select({ hit: watchHits, item: items })
    .from(watchHits)
    .innerJoin(items, eq(items.id, watchHits.itemId))
    .where(and(eq(watchHits.watchId, watchId), eq(watchHits.itemId, itemId)));
  if (!row) throw notFound('La pieza');
  const { hit, item } = row;
  const capture = (hit.capture ?? { es: null }) as Capture;
  const user = [
    `Pieza [${item.id}] en ${hit.lang === 'pt' ? 'portugués' : 'inglés'}, ${item.platform}, formato ${item.format}, de ${item.authorName}.`,
    `Por qué la atrapamos: ${(hit.reasons as string[]).join(' ')}`,
    `Texto: ${(item.title ? `${item.title}\n` : '') + item.text.slice(0, 1500)}`,
    capture.slides?.length
      ? `Láminas:\n${capture.slides.map((s) => `${s.n}. ${s.text} (en español: ${s.es})`).join('\n')}`
      : '',
    capture.video
      ? `Video: gancho «${capture.video.hook}». Ideas: ${capture.video.points.join(' / ')}`
      : '',
    capture.idea ? `Idea: ${capture.idea}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const adaptation = await deps.llm.complete({
    name: 'watch-adapt',
    system: ADAPT_PIECE_SYSTEM,
    user,
    schema: AdaptationSchema,
    maxTokens: 9000,
    variant,
    reasoningEffort: 'low',
  });
  await deps.db
    .update(watchHits)
    .set({ adaptation })
    .where(and(eq(watchHits.watchId, watchId), eq(watchHits.itemId, itemId)));
  return adaptation;
}
