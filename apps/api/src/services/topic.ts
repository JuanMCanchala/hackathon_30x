/**
 * One topic in full: its curve, what set it off, why its best pieces worked (counted), the
 * evidence, its fit with 30X and whether 30X already talked about it.
 */
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  authorTier,
  describeLift,
  featureLift,
  hourBucketOf,
  laneOf,
  outlierScores,
  rollingWindows,
  RADAR_WINDOWS,
  weekdayOf,
  type FeatureLift,
  type FeaturePiece,
  type Lane,
  type Platform,
} from '@radar/core';
import { blueskyWeekly, hnWeekly, wikipediaDaily } from '@radar/sources';
import { enrichments, items, itemTopics, topicSeries, topics } from '../db/schema';
import { notFound } from '../lib/common';
import type { Deps } from './deps';
import { fitOf, whyOf } from './explain';
import { isUniform, scoreTopics, topicView, type RadarFilters } from './radar';

const HOOK_LABEL: Record<string, string> = {
  cifra: 'una cifra',
  pregunta: 'una pregunta',
  contraintuitivo: 'una idea contraintuitiva',
  lista: 'una lista',
  historia: 'una historia personal',
  tutorial: 'un tutorial',
  noticia: 'una noticia',
  opinion: 'una opinión fuerte',
  comparacion: 'una comparación',
  demo: 'una demostración',
};
const FORMAT_LABEL: Record<string, string> = {
  post: 'posts de texto',
  carousel: 'carruseles',
  image: 'imágenes',
  reel: 'reels',
  short: 'videos cortos',
  video: 'videos',
  article: 'artículos',
  thread: 'hilos',
  repo: 'repositorios',
  model: 'modelos',
  paper: 'papers',
  news: 'notas de prensa',
  launch: 'lanzamientos',
};
const AUTHOR_LABEL: Record<string, string> = {
  empresa: 'una empresa',
  creador: 'un creador de contenido',
  medio: 'un medio',
  ejecutivo: 'un ejecutivo a título personal',
  tecnico: 'un desarrollador o investigador',
  comunidad: 'la comunidad',
};
const EMOTION_LABEL: Record<string, string> = {
  asombro: 'la sorpresa',
  utilidad: 'la utilidad práctica',
  miedo: 'la urgencia de no quedarse atrás',
  ambicion: 'la ambición',
  humor: 'la risa',
  polemica: 'la polémica',
  inspiracion: 'la inspiración',
  neutral: 'un tono neutro',
};

function labelOf(l: FeatureLift): string {
  const map =
    l.feature === 'hookType'
      ? HOOK_LABEL
      : l.feature === 'format'
        ? FORMAT_LABEL
        : l.feature === 'authorType'
          ? AUTHOR_LABEL
          : l.feature === 'emotion'
            ? EMOTION_LABEL
            : {};
  return describeLift(l, map[l.value] ?? l.value);
}

export interface PieceView {
  id: string;
  platform: Platform;
  url: string;
  authorName: string;
  authorHandle: string | null;
  authorFollowers: number | null;
  publishedAt: string;
  title: string | null;
  text: string;
  format: string;
  hookType: string | null;
  hook: string | null;
  emotion: string | null;
  audience: string | null;
  authorType: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement: number;
  outlier: number | null;
  reference: boolean;
}

type ItemRow = typeof items.$inferSelect;
type EnrichmentRow = typeof enrichments.$inferSelect;

function pieceView(item: ItemRow, e: EnrichmentRow | null, outlier: number | null): PieceView {
  return {
    id: item.id,
    platform: item.platform as Platform,
    url: item.url,
    authorName: item.authorName,
    authorHandle: item.authorHandle,
    authorFollowers: item.authorFollowers,
    publishedAt: new Date(item.publishedAt).toISOString(),
    title: item.title,
    text: item.text.slice(0, 600),
    format: item.format,
    hookType: e?.hookType ?? null,
    hook: e?.hook ?? null,
    emotion: e?.emotion ?? null,
    audience: e?.audience ?? null,
    authorType: e?.authorType ?? null,
    views: item.views,
    likes: item.likes,
    comments: item.comments,
    shares: item.shares,
    engagement: item.engagement,
    outlier,
    reference: item.reference,
  };
}

const ratioCache = new Map<string, Promise<ReturnType<typeof outlierScores>>>();

/**
 * Outlier ratios for every piece of the period, each against its author or its peers. Computed
 * once per data state: every topic page of the week reads the same ratios.
 */
async function ratiosSince(deps: Deps, since: string) {
  const [row] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(items);
  const key = `${since.slice(0, 13)}|${row?.n ?? 0}`;
  const hit = ratioCache.get(key);
  if (hit) return hit;
  ratioCache.clear();
  const value = computeRatios(deps, since);
  ratioCache.set(key, value);
  value.catch(() => ratioCache.delete(key));
  return value;
}

async function computeRatios(deps: Deps, since: string) {
  const rows = await deps.db
    .select({
      id: items.id,
      platform: items.platform,
      authorId: items.authorId,
      format: items.format,
      publishedAt: items.publishedAt,
      engagement: items.engagement,
    })
    .from(items)
    .where(gte(items.publishedAt, since));
  return outlierScores(
    rows.map((r) => ({
      ...r,
      platform: r.platform as Platform,
      format: r.format as never,
      publishedAt: new Date(r.publishedAt).toISOString(),
    })),
  );
}

const fetching = new Set<string>();

/** Six months of Wikipedia, Hacker News and Bluesky for a topic, saved once. */
export async function fetchHistory(deps: Deps, topic: typeof topics.$inferSelect, asOf: string) {
  const to = asOf.slice(0, 10);
  const from = new Date(Date.parse(asOf) - 180 * 86_400_000).toISOString().slice(0, 10);
  const query = topic.queries[0] ?? topic.name;
  const rows: { topicId: string; source: string; date: string; value: number }[] = [];
  const add = (source: string, points: { date: string; value: number }[]) =>
    points.forEach((p) => rows.push({ topicId: topic.id, source, date: p.date, value: p.value }));
  await Promise.allSettled([
    topic.wikipedia
      ? wikipediaDaily('en', topic.wikipedia, from, to).then((p) => add('wikipedia', p))
      : Promise.resolve(),
    hnWeekly(query, from, to).then((p) => add('hn', p)),
    blueskyWeekly(query, 'en', from, to).then((p) => add('bluesky', p)),
  ]);
  if (rows.length) await deps.db.insert(topicSeries).values(rows).onConflictDoNothing();
  return rows.length;
}

/**
 * The topic's long history. The first visit starts the download in the background and answers
 * right away; the history shows from the next visit (the pipeline also fetches it ahead).
 */
async function historyOf(deps: Deps, topic: typeof topics.$inferSelect, asOf: string) {
  const existing = await deps.db
    .select()
    .from(topicSeries)
    .where(eq(topicSeries.topicId, topic.id));
  if (!existing.length && deps.config.LLM_MODE !== 'replay' && !fetching.has(topic.id)) {
    fetching.add(topic.id);
    void fetchHistory(deps, topic, asOf)
      .catch(() => 0)
      .finally(() => fetching.delete(topic.id));
  }
  const label: Record<string, string> = {
    wikipedia: 'Visitas en Wikipedia (inglés), por día',
    hn: 'Historias en Hacker News, por semana',
    bluesky: 'Posts en Bluesky, por semana',
  };
  return ['wikipedia', 'hn', 'bluesky']
    .map((source) => ({
      source: source as 'wikipedia' | 'hn' | 'bluesky',
      label: label[source]!,
      points: existing
        .filter((r) => r.source === source)
        .map((r) => ({ date: r.date, value: r.value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((s) => s.points.some((p) => p.value > 0));
}

export async function topicDetail(
  deps: Deps,
  id: string,
  filters: Pick<RadarFilters, 'region'> = { region: 'global' },
) {
  const [topic] = await deps.db.select().from(topics).where(eq(topics.id, id));
  if (!topic) throw notFound('El tema');
  const { asOf, scored } = await scoreTopics(deps, filters);
  const ranked = scored.filter((s) => s.core.momentum > 0);
  const index = ranked.findIndex((s) => s.core.id === id);
  const s = scored.find((t) => t.core.id === id);
  if (!s) throw notFound('El tema no tiene piezas recientes y');
  const windows = rollingWindows(asOf, RADAR_WINDOWS);
  const week = windows.at(-1)!.label;
  const recentStart = windows.at(-2)!.start;

  // Every piece of the topic, newest first, with what the model read in it.
  const rows = await deps.db
    .select({ item: items, e: enrichments })
    .from(itemTopics)
    .innerJoin(items, eq(items.id, itemTopics.itemId))
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(and(eq(itemTopics.topicId, id), gte(items.publishedAt, windows[0]!.start)))
    .orderBy(desc(items.publishedAt));
  const ratios = await ratiosSince(
    deps,
    new Date(Date.parse(asOf) - 63 * 86_400_000).toISOString(),
  );
  const ratioOf = (itemId: string) => {
    const r = ratios.get(itemId);
    return r && r.baselineKind !== 'none' ? Math.round(r.ratio * 10) / 10 : null;
  };

  // The curve: distinct creators per window by lane, from every source.
  const weekly = windows.slice(-8).map((w) => {
    const inWindow = rows.filter(({ item }) => {
      const t = new Date(item.publishedAt).toISOString();
      return t > w.start && t <= w.end;
    });
    const byLane: Record<Lane, Set<string>> = {
      mainstream: new Set(),
      technical: new Set(),
      media: new Set(),
    };
    for (const { item } of inWindow)
      byLane[laneOf(item.platform as Platform)].add(`${item.platform}:${item.authorId}`);
    const uniform = inWindow.filter(({ item }) =>
      isUniform({
        platform: item.platform as Platform,
        approx: item.publishedApprox,
        query: item.query,
      }),
    );
    return {
      week: w.label,
      creators: new Set(uniform.map(({ item }) => `${item.platform}:${item.authorId}`)).size,
      pieces: inWindow.length,
      byLane: {
        mainstream: byLane.mainstream.size,
        technical: byLane.technical.size,
        media: byLane.media.size,
      },
    };
  });

  // What set it off: the most engaging news of the first window the topic stood out.
  const series = s.core.series;
  const firstSignal = series.findIndex(
    (w, i) =>
      i >= 4 &&
      w.creators >= 3 &&
      w.creators >= 1.8 * (series.slice(i - 4, i).reduce((a, b) => a + b.creators, 0) / 4 + 1),
  );
  const triggerWindow = windows[firstSignal >= 0 ? firstSignal : windows.length - 1]!;
  const triggerPiece = rows
    .filter(({ item }) => {
      const t = new Date(item.publishedAt).toISOString();
      return (
        t > triggerWindow.start &&
        t <= triggerWindow.end &&
        ['news', 'hn', 'newsletter'].includes(item.platform)
      );
    })
    .sort(
      (a, b) =>
        Date.parse(a.item.publishedAt) - Date.parse(b.item.publishedAt) ||
        b.item.engagement - a.item.engagement,
    )[0];

  // Why: traits of the pieces that broke out (≥2× their author's median) against the rest.
  const recent = rows.filter(({ item }) => new Date(item.publishedAt).toISOString() > recentStart);
  const featurePieces: FeaturePiece[] = recent.map(({ item, e }) => {
    const exact = !item.publishedApprox;
    const ratio = ratioOf(item.id);
    return {
      id: item.id,
      outlier: ratio !== null && ratio >= 2,
      features: {
        hookType: e?.hookType && e.hookType !== 'otro' ? e.hookType : null,
        format: item.format,
        weekday: exact ? weekdayOf(new Date(item.publishedAt).toISOString()) : null,
        hourBucket: exact ? hourBucketOf(new Date(item.publishedAt).toISOString()) : null,
        authorTier: item.authorFollowers ? authorTier(item.authorFollowers) : null,
        authorType: e?.authorType ?? null,
        emotion: e?.emotion && e.emotion !== 'neutral' ? e.emotion : null,
      },
    };
  });
  const lifts = featureLift(featurePieces, { top: 4 });
  const patterns = lifts.map((l) => ({
    feature: l.feature,
    value: l.value,
    label: labelOf(l),
    outliers: l.outlierCount,
    outlierTotal: l.outlierTotal,
    rest: l.restCount,
    restTotal: l.restTotal,
    lift: Math.round(l.lift * 100) / 100,
  }));

  // Evidence: the pieces that broke out most, a few per platform so every network shows.
  const perPlatform = new Map<string, number>();
  const evidenceRows = [...recent]
    .sort(
      (a, b) =>
        (ratioOf(b.item.id) ?? 0) - (ratioOf(a.item.id) ?? 0) ||
        b.item.engagement - a.item.engagement,
    )
    .filter(({ item }) => {
      const n = perPlatform.get(item.platform) ?? 0;
      if (n >= 3) return false;
      perPlatform.set(item.platform, n + 1);
      return true;
    })
    .slice(0, 9);
  const evidence = evidenceRows.map(({ item, e }) => pieceView(item, e, ratioOf(item.id)));

  const view = topicView(s, index >= 0 ? index + 1 : 0);
  const why = await whyOf(deps, {
    topicId: id,
    week,
    name: topic.name,
    definition: topic.definition,
    stage: view.stage,
    growthPct: view.growthPct,
    creators: view.creators,
    patterns: patterns.map((p) => p.label),
    evidence: evidence.map((p) => ({
      id: p.id,
      line: `${p.platform}, ${p.authorName}${p.authorFollowers ? ` (${p.authorFollowers} seguidores)` : ''}, ${p.format}, ${p.publishedAt.slice(0, 10)}: «${(p.hook || p.title || p.text).slice(0, 140)}»; engagement ${Math.round(p.engagement)}${p.outlier ? `, ${p.outlier}× la mediana de su autor` : ''}`,
    })),
  });
  const fit = await fitOf(deps, {
    topicId: id,
    week,
    name: topic.name,
    definition: topic.definition,
    samples: evidence.slice(0, 6).map((p) => (p.hook || p.title || p.text).slice(0, 160)),
  });

  const coverageRows = await deps.db
    .select({ item: items, e: enrichments })
    .from(itemTopics)
    .innerJoin(items, eq(items.id, itemTopics.itemId))
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(and(eq(itemTopics.topicId, id), eq(items.reference, true)))
    .orderBy(desc(items.publishedAt))
    .limit(6);

  return {
    topic: {
      ...view,
      fit: fit?.score ?? view.fit,
      why: why?.oneLiner ?? view.why,
      queries: topic.queries,
      wikipedia: topic.wikipedia,
    },
    weekly,
    history: await historyOf(deps, topic, asOf),
    trigger: triggerPiece
      ? {
          date: new Date(triggerPiece.item.publishedAt).toISOString(),
          title: triggerPiece.item.title || triggerPiece.item.text.slice(0, 140),
          url: triggerPiece.item.url,
          source: triggerPiece.item.authorName,
        }
      : null,
    why: { patterns, narrative: why?.narrative ?? null, cited: why?.cited ?? [] },
    fit,
    evidence,
    coverage: coverageRows.length
      ? [
          {
            name: '30X y Andrés Bilbao',
            pieces: coverageRows.map(({ item, e }) => pieceView(item, e, ratioOf(item.id))),
          },
        ]
      : [],
  };
}

/** Pieces by id, for citations. */
export async function piecesById(deps: Deps, ids: string[]) {
  if (!ids.length) return [];
  return deps.db.select().from(items).where(inArray(items.id, ids));
}
