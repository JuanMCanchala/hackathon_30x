/**
 * The weekly radar: which AI topics grow the most, at what stage of their wave, where they are
 * moving and whether 30X already covered them.
 *
 * Growth is measured only on sources sampled the same way in every window (Bluesky, Google
 * News, Hacker News and GitHub's new repositories: the top results per query and window), so
 * the current week is never inflated by feeds that only show recent posts. Instagram, LinkedIn,
 * YouTube, X and TikTok say where a topic already arrived and give the evidence.
 */
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  mean,
  percentile,
  rankTopics,
  windowIndexOf,
  rollingWindows,
  RADAR_WINDOWS,
  type Platform,
  type RadarPiece,
  type RadarTopic as CoreTopic,
} from '@radar/core';
import { analyses, enrichments, items, itemTopics, llmUsage, runs, topics } from '../db/schema';
import type { Deps } from './deps';

export type StageKey = 'emergente' | 'crecimiento' | 'saturado' | 'declive' | 'estable';

const STAGE_KEY: Record<CoreTopic['stage'], StageKey> = {
  emerging: 'emergente',
  growing: 'crecimiento',
  saturated: 'saturado',
  declining: 'declive',
  stable: 'estable',
};

/** Where each stage's stretch of the wave starts and ends (the web draws the same wave). */
const WAVE: Record<StageKey, [number, number]> = {
  emergente: [0.07, 0.31],
  crecimiento: [0.33, 0.55],
  saturado: [0.57, 0.71],
  declive: [0.74, 0.95],
  estable: [0.26, 0.32],
};

/** A topic counts as useful for 30X's audience from this fit on (1 to 10). */
export const AUDIENCE_FIT = 7;

/** The languages the radar follows: viral AI content usually starts in English or Portuguese. */
export type Lang = 'en' | 'pt' | 'es';
export const LANGS: readonly Lang[] = ['en', 'pt', 'es'];

/** A topic's wave in one language, measured on the evenly sampled sources in that language. */
export interface LanguageWave {
  lang: Lang;
  creators: number;
  growthPct: number;
  stage: StageKey | 'ausente';
  wavePos: number | null;
  sparkline: number[];
}

export interface RadarFilters {
  platform: 'all' | Platform;
  /** `30x`: only topics whose fit with 30X's audience is at least AUDIENCE_FIT. */
  audience?: 'all' | '30x';
  /** `latam`: pieces in Spanish only. */
  region: 'global' | 'latam';
  /** Only topics 30X and Andrés Bilbao have not touched in 60 days. */
  untouched: boolean;
}

export interface RadarTopicView {
  id: string;
  rank: number;
  name: string;
  definition: string | null;
  stage: StageKey;
  timing: string;
  growthPct: number;
  lift: number;
  momentum: number;
  creators: number;
  pieces: number;
  platforms: Platform[];
  sparkline: number[];
  fit: number | null;
  why: string | null;
  wavePos: number;
  untouched: boolean;
  forming: boolean;
  /** Nobody talked about it in the four weeks before: new this week, its growth is not a ratio. */
  fresh: boolean;
  /** Sources sampled alike where it grows by itself; with fewer than two it is «por confirmar». */
  growingIn: Platform[];
  confirmed: boolean;
  /** Its wave in English, Portuguese and Spanish. */
  languages: Record<Lang, LanguageWave>;
  /**
   * Already viral in English or Portuguese while Spanish has barely started: the window to adapt
   * it first. `leader` is the language it comes from; `lagDays`, how long Spanish took (or has
   * taken so far) after the leader's first standout week.
   */
  spanishWindow: { open: boolean; leader: Lang | null; lagDays: number | null; reached: boolean };
}

/** One piece as the radar counts it. */
export interface PieceRow {
  id: string;
  topicId: string;
  platform: Platform;
  authorId: string;
  publishedAt: string;
  approx: boolean;
  engagement: number;
  query: string | null;
  lang: string | null;
  reference: boolean;
}

/** Sampled the same way in every 7-day window, so their counts can be compared over time. */
export function isUniform(p: Pick<PieceRow, 'platform' | 'approx' | 'query'>): boolean {
  if (p.approx) return false;
  // A followed topic searches on demand, not alike every week: its finds never count as growth.
  if ((p.query ?? '').startsWith('vigia:')) return false;
  // YouTube stays out even with exact dates from videos.list: its search shows only this week's
  // top results and cannot be replayed for past weeks, so older windows hold only what earlier
  // captures happened to see. It counts for presence and evidence, not for the curve.
  if (p.platform === 'bluesky' || p.platform === 'news' || p.platform === 'hn') return true;
  return p.platform === 'github' && (p.query ?? '').startsWith('created:');
}

/**
 * The end of the newest capture: windows end here, so a frozen demo stays a full week. Pieces
 * that only Vigía or the sensor brought in arrive on demand and do not move it.
 */
export async function asOfOf(deps: Deps): Promise<string> {
  const [row] = await deps.db
    .select({ at: sql<string | null>`max(${items.lastSeenAt})` })
    .from(items)
    .where(sql`not ${items.viaSensor} and coalesce(${items.query}, '') not like 'vigia:%'`);
  return row?.at ? new Date(row.at).toISOString() : deps.clock.now().toISOString();
}

/** Every piece linked to a topic inside the radar's windows. */
export async function topicPieces(deps: Deps, since: string): Promise<PieceRow[]> {
  const rows = await deps.db
    .select({
      id: items.id,
      topicId: itemTopics.topicId,
      platform: items.platform,
      authorId: items.authorId,
      publishedAt: items.publishedAt,
      approx: items.publishedApprox,
      engagement: items.engagement,
      query: items.query,
      lang: sql<string | null>`coalesce(${enrichments.lang}, ${items.lang})`,
      reference: items.reference,
    })
    .from(itemTopics)
    .innerJoin(items, eq(items.id, itemTopics.itemId))
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(gte(items.publishedAt, since));
  return rows.map((r) => ({
    ...r,
    platform: r.platform as Platform,
    publishedAt: new Date(r.publishedAt).toISOString(),
  }));
}

export const langOf = (p: Pick<PieceRow, 'lang'>): Lang | null => {
  const l = (p.lang ?? '').slice(0, 2).toLowerCase();
  return l === 'en' || l === 'pt' || l === 'es' ? l : null;
};

const radarPiece = (p: PieceRow): RadarPiece => ({
  platform: p.platform,
  authorId: p.authorId,
  publishedAt: p.publishedAt,
  engagement: p.engagement,
});

/** Position on the wave: the stage's stretch, further along the more established the topic. */
function wavePosition(stage: StageKey, t: CoreTopic, p50: number, p90: number): number {
  const [from, to] = WAVE[stage];
  let f = 0.5;
  if (stage === 'emergente') f = p50 > 0 ? Math.min(1, t.creators / p50) : 0.5;
  else if (stage === 'crecimiento')
    f = p90 > p50 ? Math.min(1, Math.max(0, (t.creators - p50) / (p90 - p50))) : 0.5;
  else if (stage === 'saturado') f = Math.min(1, Math.max(0, 1.2 - t.lift));
  else if (stage === 'declive') f = Math.min(1, Math.max(0, 1 - t.lift));
  return Math.round((from + f * (to - from)) * 1000) / 1000;
}

export interface TopicMeta {
  id: string;
  name: string;
  definition: string | null;
  generic: boolean;
  /** Named by the model; unnamed topics only carry a raw label. */
  named: boolean;
  fit: number | null;
  why: string | null;
}

async function topicMeta(deps: Deps): Promise<Map<string, TopicMeta>> {
  const rows = await deps.db.select().from(topics);
  const notes = await deps.db
    .select({
      topicId: analyses.topicId,
      kind: analyses.kind,
      payload: analyses.payload,
      week: analyses.week,
    })
    .from(analyses)
    .orderBy(desc(analyses.week));
  const fit = new Map<string, number>();
  const why = new Map<string, string>();
  for (const n of notes) {
    const payload = n.payload as { score?: number; oneLiner?: string };
    if (n.kind === 'fit' && typeof payload.score === 'number' && !fit.has(n.topicId))
      fit.set(n.topicId, payload.score);
    if (n.kind === 'why' && typeof payload.oneLiner === 'string' && !why.has(n.topicId))
      why.set(n.topicId, payload.oneLiner);
  }
  return new Map(
    rows.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        definition: t.definition,
        generic: t.generic,
        named: t.named,
        fit: fit.get(t.id) ?? null,
        why: why.get(t.id) ?? null,
      },
    ]),
  );
}

export interface ScoredTopic {
  core: CoreTopic;
  meta: TopicMeta;
  stage: StageKey;
  languages: Record<Lang, LanguageWave>;
  spanishWindow: { open: boolean; leader: Lang | null; lagDays: number | null; reached: boolean };
  /** Uniform sources where the topic grows on its own (lift ≥ 1.5 with 2+ creators). */
  growingIn: Platform[];
  platforms: Platform[];
  presence: Partial<Record<Platform, number>>;
  forming: boolean;
  untouched: boolean;
  wavePos: number;
}

/**
 * Scores every topic. Three passes of the same pure ranking: on the uniform sources for growth
 * and stage, on uniform plus LinkedIn and Instagram for «Se está formando», and on everything
 * for where the topic is this week.
 */
type Scored = { asOf: string; scored: ScoredTopic[]; pieces: PieceRow[] };

/** Scores are recomputed only when the data changes: new pieces, links or analyses. */
const scoreCache = new Map<string, { at: number; value: Promise<Scored> }>();

async function dataVersion(deps: Deps): Promise<string> {
  const [row] = await deps.db
    .select({
      links: sql<number>`(select count(*) from item_topics)::int`,
      notes: sql<number>`(select count(*) from analyses)::int`,
      topics: sql<number>`(select count(*) from topics)::int`,
    })
    .from(sql`(select 1) as one`);
  return `${row?.links}-${row?.notes}-${row?.topics}`;
}

export async function scoreTopics(
  deps: Deps,
  filters: Pick<RadarFilters, 'region'> = { region: 'global' },
): Promise<Scored> {
  const asOf = await asOfOf(deps);
  const key = `${filters.region}|${asOf}|${await dataVersion(deps)}`;
  const hit = scoreCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  const value = computeScores(deps, filters, asOf);
  scoreCache.clear();
  scoreCache.set(key, { at: Date.now(), value });
  value.catch(() => scoreCache.delete(key));
  return value;
}

async function computeScores(
  deps: Deps,
  filters: Pick<RadarFilters, 'region'>,
  asOf: string,
): Promise<Scored> {
  const windows = rollingWindows(asOf, RADAR_WINDOWS);
  const since = windows[0]!.start;
  const metaById = await topicMeta(deps);
  let pieces = await topicPieces(deps, since);
  if (filters.region === 'latam') pieces = pieces.filter((p) => (p.lang ?? '').startsWith('es'));

  const byTopic = new Map<string, PieceRow[]>();
  for (const p of pieces) {
    const meta = metaById.get(p.topicId);
    if (!meta || meta.generic) continue;
    (byTopic.get(p.topicId) ?? byTopic.set(p.topicId, []).get(p.topicId)!).push(p);
  }
  const input = (filter: (p: PieceRow) => boolean) =>
    [...byTopic].map(([id, list]) => ({
      id,
      label: metaById.get(id)!.name,
      pieces: list.filter(filter).map(radarPiece),
      fit: metaById.get(id)!.fit,
    }));

  const growth = rankTopics(input(isUniform), { asOf, top: 10_000 });
  const arrival = rankTopics(
    input((p) => isUniform(p) || p.platform === 'linkedin' || p.platform === 'instagram'),
    { asOf, top: 10_000 },
  );
  const formingById = new Map(arrival.all.map((t) => [t.id, t.forming]));
  // The same ranking once per language, on that language's evenly sampled pieces.
  const byLang = new Map(
    LANGS.map((lang) => {
      const ranked = rankTopics(
        input((p) => isUniform(p) && langOf(p) === lang),
        { asOf, top: 10_000 },
      );
      const active = ranked.all.map((t) => t.creators).filter((c) => c > 0);
      return [
        lang,
        {
          byId: new Map(ranked.all.map((t) => [t.id, t])),
          p50: percentile(active, 50),
          p90: percentile(active, 90),
        },
      ] as const;
    }),
  );
  const currentStart = windows.at(-1)!.start;
  const referenceSince = new Date(Date.parse(asOf) - 60 * 86_400_000).toISOString();

  const p50 = percentile(
    growth.all.map((t) => t.creators).filter((c) => c > 0),
    50,
  );
  const p90 = percentile(
    growth.all.map((t) => t.creators).filter((c) => c > 0),
    90,
  );

  const scored = growth.all.map((core): ScoredTopic => {
    const list = byTopic.get(core.id) ?? [];
    const presence: Partial<Record<Platform, number>> = {};
    const creators = new Map<Platform, Set<string>>();
    for (const p of list) {
      if (p.publishedAt <= currentStart) continue;
      (creators.get(p.platform) ?? creators.set(p.platform, new Set()).get(p.platform)!).add(
        p.authorId,
      );
    }
    for (const [platform, set] of creators) presence[platform] = set.size;
    const platforms = [...creators.keys()].sort((a, b) => (presence[b] ?? 0) - (presence[a] ?? 0));
    const stage = STAGE_KEY[core.stage];
    const languages = Object.fromEntries(
      LANGS.map((lang) => {
        const l = byLang.get(lang)!;
        const t = l.byId.get(core.id);
        const seen = t ? t.series.some((w) => w.creators > 0) : false;
        const langStage: StageKey | 'ausente' = t && seen ? STAGE_KEY[t.stage] : 'ausente';
        return [
          lang,
          {
            lang,
            creators: t?.creators ?? 0,
            growthPct: t?.growthPct ?? 0,
            stage: langStage,
            wavePos: t && langStage !== 'ausente' ? wavePosition(langStage, t, l.p50, l.p90) : null,
            sparkline: t?.sparkline ?? [],
          } satisfies LanguageWave,
        ];
      }),
    ) as Record<Lang, LanguageWave>;
    return {
      core,
      meta: metaById.get(core.id)!,
      stage,
      languages,
      spanishWindow: spanishWindowOf(
        languages,
        LANGS.map(
          (lang) =>
            byLang
              .get(lang)!
              .byId.get(core.id)
              ?.series.map((w) => w.creators) ?? [],
        ),
      ),
      growingIn: growingIn(list, windows),
      platforms,
      presence,
      forming: formingById.get(core.id) ?? false,
      untouched: !list.some((p) => p.reference && p.publishedAt >= referenceSince),
      wavePos: wavePosition(stage, core, p50, p90),
    };
  });
  return { asOf, scored, pieces };
}

/** First week (index) a language's series stood out: 3+ creators and 1.8x its last four. */
function firstStandout(series: number[]): number | null {
  for (let i = 4; i < series.length; i++) {
    const base = series.slice(i - 4, i).reduce((a, b) => a + b, 0) / 4;
    if (series[i]! >= 3 && (series[i]! + 1) / (base + 1) >= 1.8) return i;
  }
  return null;
}

/**
 * The Spanish window: the topic already has a crowd in English or Portuguese (6+ creators this
 * week) while Spanish has a quarter of it or less. The lag is counted between the leader's first
 * standout week and Spanish's (or this week, if Spanish has not stood out yet).
 */
function spanishWindowOf(languages: Record<Lang, LanguageWave>, series: number[][]) {
  const [en, pt] = [languages.en, languages.pt];
  const leader: Lang | null =
    Math.max(en.creators, pt.creators) >= 6 ? (en.creators >= pt.creators ? 'en' : 'pt') : null;
  if (!leader) return { open: false, leader: null, lagDays: null, reached: false };
  const lead = languages[leader];
  const open = languages.es.creators <= Math.max(2, Math.floor(lead.creators / 4));
  const leadStart = firstStandout(series[LANGS.indexOf(leader)] ?? []);
  const esSeries = series[LANGS.indexOf('es')] ?? [];
  const esStart = firstStandout(esSeries);
  const lagWeeks =
    leadStart === null
      ? null
      : esStart !== null
        ? esStart - leadStart
        : esSeries.length - 1 - leadStart;
  return {
    open,
    leader,
    lagDays: lagWeeks !== null && lagWeeks >= 0 ? lagWeeks * 7 : null,
    /** Whether Spanish stood out too; if not, the lag is still counting. */
    reached: esStart !== null,
  };
}

const UNIFORM: readonly Platform[] = ['bluesky', 'news', 'hn', 'github'];

/**
 * The uniform sources where a topic grows by itself. The backtest showed that one source alone
 * gives many false alarms, so a topic growing in only one is shown as «por confirmar».
 */
function growingIn(list: PieceRow[], windows: ReturnType<typeof rollingWindows>): Platform[] {
  const out: Platform[] = [];
  for (const platform of UNIFORM) {
    const creators = windows.map(() => new Set<string>());
    for (const p of list) {
      if (p.platform !== platform || !isUniform(p)) continue;
      const k = windowIndexOf(p.publishedAt, windows);
      if (k >= 0) creators[k]!.add(p.authorId);
    }
    const series = creators.map((c) => c.size);
    const current = series.at(-1) ?? 0;
    const baseline = mean(series.slice(-5, -1));
    if (current >= 2 && (current + 1) / (baseline + 1) >= 1.5) out.push(platform);
  }
  return out;
}

export function topicView(s: ScoredTopic, rank: number): RadarTopicView {
  return {
    id: s.core.id,
    rank,
    name: s.meta.name,
    definition: s.meta.definition,
    stage: s.stage,
    timing: s.core.timingLabel,
    growthPct: s.core.growthPct,
    lift: s.core.lift,
    momentum: s.core.momentum,
    creators: s.core.creators,
    pieces: s.core.pieces,
    platforms: s.platforms,
    sparkline: s.core.sparkline,
    fit: s.meta.fit,
    why: s.meta.why,
    wavePos: s.wavePos,
    untouched: s.untouched,
    forming: s.forming,
    fresh: baselineOf(s.core) < 0.5,
    growingIn: s.growingIn,
    confirmed: s.growingIn.length >= 2,
    languages: s.languages,
    spanishWindow: s.spanishWindow,
  };
}

/** Mean distinct creators in the four windows before the current one. */
function baselineOf(core: CoreTopic): number {
  const previous = core.series.slice(-5, -1).map((w) => w.creators);
  return previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : 0;
}

/**
 * Spreads the shown topics along their stage's stretch of the wave, in the order of how far
 * along each one is, so ten topics in the same stage never sit on the same dot.
 */
export function spreadOnWave(views: RadarTopicView[]): RadarTopicView[] {
  const byStage = new Map<StageKey, RadarTopicView[]>();
  for (const v of views) (byStage.get(v.stage) ?? byStage.set(v.stage, []).get(v.stage)!).push(v);
  const placed = new Map<string, number>();
  for (const [stage, list] of byStage) {
    const [from, to] = WAVE[stage];
    const sorted = [...list].sort((a, b) => a.wavePos - b.wavePos || b.momentum - a.momentum);
    sorted.forEach((v, i) =>
      placed.set(
        v.id,
        Math.round((from + ((i + 1) / (sorted.length + 1)) * (to - from)) * 1000) / 1000,
      ),
    );
  }
  return views.map((v) => ({ ...v, wavePos: placed.get(v.id) ?? v.wavePos }));
}

/** USD spent in the last 7 days: model calls (as recorded) and paid data. */
export async function weekCost(deps: Deps, asOf: string) {
  const since = new Date(Date.parse(asOf) - 7 * 86_400_000).toISOString();
  const [llm] = await deps.db
    .select({
      usd: sql<number>`coalesce(sum(${llmUsage.costUsd}) filter (where not ${llmUsage.replayed}), 0)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.at, since));
  const [data] = await deps.db
    .select({ usd: sql<number>`coalesce(sum(${runs.costUsd}), 0)` })
    .from(runs)
    .where(and(gte(runs.startedAt, since)));
  const llmUsd = Number(llm?.usd ?? 0);
  const dataUsd = Number(data?.usd ?? 0);
  return { weekUsd: llmUsd + dataUsd, llmUsd, dataUsd };
}

const HeadlineSchema = z.object({ headline: z.string() });

const HEADLINE_SYSTEM = `Escribes el titular del radar semanal de contenido de 30X, una escuela de negocios de Latinoamérica que enseña IA a ejecutivos. Te damos los temas de IA que más crecen esta semana con su etapa y crecimiento.

Escribe UNA frase en español, de 8 a 16 palabras, que diga de qué habla la IA esta semana, nombrando los 2 o 3 temas más fuertes con sus nombres propios. Tono editorial, concreto, sin signos de exclamación, sin la palabra "revolución", sin emojis. Ejemplo de forma (no de contenido): "Esta semana la conversación de IA gira hacia los agentes que venden y Sora 2".`;

async function headlineOf(deps: Deps, top: RadarTopicView[], scope: string): Promise<string> {
  const fallback = top.length
    ? `Esta semana crecen ${top
        .slice(0, 3)
        .map((t) => t.name)
        .join(', ')
        .replace(/, ([^,]*)$/, ' y $1')}.`
    : 'Esta semana no hay temas creciendo con este filtro.';
  if (!top.length) return fallback;
  const user = `Alcance: ${scope}\n${top
    .slice(0, 6)
    .map(
      (t) =>
        `${t.rank}. ${t.name} (${t.stage}, ${t.growthPct >= 0 ? '+' : ''}${t.growthPct} %, ${t.creators} creadores)`,
    )
    .join('\n')}`;
  try {
    const result = await deps.llm.complete({
      name: 'headline',
      system: HEADLINE_SYSTEM,
      user,
      schema: HeadlineSchema,
      maxTokens: 2000,
      reasoningEffort: 'none',
    });
    return result.headline.trim().replace(/\.$/, '') + '.';
  } catch {
    return fallback;
  }
}

const SCOPE: Record<string, string> = {
  all: 'todas las redes',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
};

export async function radar(deps: Deps, filters: RadarFilters) {
  const { asOf, scored, pieces } = await scoreTopics(deps, filters);
  const windows = rollingWindows(asOf, RADAR_WINDOWS);
  const current = windows.at(-1)!;

  let candidates = scored.filter((s) => s.core.momentum > 0 && s.meta.named);
  if (filters.platform !== 'all') {
    const platform = filters.platform;
    candidates = candidates.filter((s) => (s.presence[platform] ?? 0) >= 1);
  }
  if (filters.untouched) candidates = candidates.filter((s) => s.untouched);
  const beforeAudience = Math.min(10, candidates.length);
  // How many of the unfiltered top 10 the audience filter leaves out, to say so on screen.
  const fits = (s: ScoredTopic) => (s.meta.fit ?? 0) >= AUDIENCE_FIT;
  const hiddenByAudience =
    filters.audience === '30x' ? candidates.slice(0, 10).filter((s) => !fits(s)).length : 0;
  if (filters.audience === '30x') candidates = candidates.filter(fits);
  const top = spreadOnWave(candidates.slice(0, 10).map((s, i) => topicView(s, i + 1)));
  const forming = scored
    .filter(
      (s) =>
        s.forming &&
        s.meta.named &&
        (filters.audience !== '30x' || fits(s)) &&
        !top.some((t) => t.id === s.core.id),
    )
    .sort((a, b) => b.core.technicalLift - a.core.technicalLift)
    .slice(0, 6)
    .map((s, i) => topicView(s, i + 1));

  // Viral in English or Portuguese, not yet in Spanish: the topics to adapt first.
  const windowsOpen = scored
    .filter(
      (s) =>
        s.spanishWindow.open &&
        s.meta.named &&
        (filters.audience !== '30x' || (s.meta.fit ?? 0) >= AUDIENCE_FIT),
    )
    .sort(
      (a, b) =>
        (b.languages[b.spanishWindow.leader!]?.creators ?? 0) -
        (a.languages[a.spanishWindow.leader!]?.creators ?? 0),
    )
    .slice(0, 6)
    .map((s, i) => topicView(s, i + 1));

  const currentPieces = pieces.filter((p) => p.publishedAt > current.start);
  const creators = new Set(currentPieces.map((p) => `${p.platform}:${p.authorId}`));
  const sources = new Set(currentPieces.map((p) => p.platform));
  const scope = `${SCOPE[filters.platform] ?? filters.platform}${filters.region === 'latam' ? ', solo piezas en español' : ''}`;
  const coverage = coverageOf(filters.platform, top.length, beforeAudience, currentPieces);

  return {
    week: { start: current.start, end: current.end },
    headline: await headlineOf(deps, top, scope),
    basis: {
      pieces: new Set(currentPieces.map((p) => p.id)).size,
      creators: creators.size,
      sources: sources.size,
      updatedAt: asOf,
    },
    topics: top,
    forming,
    windowsOpen,
    hiddenByAudience,
    coverage,
    cost: await weekCost(deps, asOf),
  };
}

/**
 * Why one platform fills fewer than 10 places: how many of its pieces this week belong to a
 * topic. Null for every network, or when the top 10 is full.
 */
function coverageOf(
  platform: RadarFilters['platform'],
  shown: number,
  /** Topics the platform filter left, up to 10, before the 30X fit filter. */
  beforeAudience: number,
  current: PieceRow[],
) {
  if (platform === 'all' || shown >= 10) return null;
  const name = SCOPE[platform] ?? (platform === 'bluesky' ? 'Bluesky' : platform);
  const pieces = new Set(current.filter((p) => p.platform === platform).map((p) => p.id)).size;
  const topics = (n: number) => `${n} ${n === 1 ? 'tema' : 'temas'}`;
  const reasons: string[] = [];
  if (beforeAudience > shown)
    reasons.push(
      `El filtro de encaje con 30X deja fuera ${beforeAudience - shown} de los ${topics(beforeAudience)} de ${name}; con todas las audiencias aparecen.`,
    );
  if (beforeAudience < 10)
    reasons.push(
      pieces === 0
        ? `Esta semana ninguna pieza de ${name} cae en un tema del radar: lo que capturamos de ${name} es poco frente a Bluesky, noticias y Hacker News.`
        : `Solo ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'} de ${name} ${pieces === 1 ? 'cae' : 'caen'} esta semana en temas del radar: alcanzan para ${topics(beforeAudience)}, no para 10.`,
    );
  return { platform, pieces, reason: reasons.join(' ') };
}
