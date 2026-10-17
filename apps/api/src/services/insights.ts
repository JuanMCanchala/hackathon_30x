/**
 * Three read-only views on top of the radar: what works for 30X's reference profiles, how the
 * radar is measured (backtest, sources, cost), and "Pregúntale al radar", which answers from
 * the week's numbers and cites the topics and pieces they came from.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { median, type Platform } from '@radar/core';
import { enrichments, items, itemTopics, runs, topics } from '../db/schema';
import { AppError } from '../lib/common';
import type { Deps } from './deps';
import { radar, scoreTopics, weekCost, asOfOf } from './radar';
import { REFERENCES, referenceOf } from './references';

// ------------------------------------------------------------------ references

export async function referencesView(deps: Deps) {
  const rows = await deps.db
    .select({ item: items, e: enrichments })
    .from(items)
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(eq(items.reference, true))
    .orderBy(desc(items.publishedAt));
  const topicLinks = rows.length
    ? await deps.db
        .select({ itemId: itemTopics.itemId, id: topics.id, name: topics.name })
        .from(itemTopics)
        .innerJoin(topics, eq(topics.id, itemTopics.topicId))
        .where(
          inArray(
            itemTopics.itemId,
            rows.map((r) => r.item.id),
          ),
        )
    : [];
  const profiles = REFERENCES.map((profile) => {
    const mine = rows.filter(
      ({ item }) =>
        referenceOf(item.platform, {
          id: item.authorId,
          handle: item.authorHandle ?? undefined,
          name: item.authorName,
        }) === profile,
    );
    const engagement = mine.map(({ item }) => item.engagement);
    const mid = median(engagement);
    const pieces = mine.map(({ item, e }) => ({
      id: item.id,
      url: item.url,
      platform: item.platform as Platform,
      publishedAt: new Date(item.publishedAt).toISOString(),
      format: item.format,
      text: (item.title || item.text).slice(0, 280),
      hook: e?.hook ?? null,
      hookType: e?.hookType ?? null,
      views: item.views,
      likes: item.likes,
      comments: item.comments,
      engagement: item.engagement,
      ratio: mid > 0 ? Math.round((item.engagement / mid) * 10) / 10 : null,
      topics: topicLinks
        .filter((l) => l.itemId === item.id)
        .map((l) => ({ id: l.id, name: l.name })),
    }));
    const formats = new Map<string, { n: number; ratios: number[] }>();
    for (const p of pieces) {
      const f = formats.get(p.format) ?? { n: 0, ratios: [] };
      f.n += 1;
      if (p.ratio !== null) f.ratios.push(p.ratio);
      formats.set(p.format, f);
    }
    return {
      name: profile.name,
      role: profile.role,
      platform: profile.platform,
      url: profile.url,
      followers: mine.find(({ item }) => item.authorFollowers)?.item.authorFollowers ?? null,
      pieces: pieces.length,
      medianEngagement: Math.round(mid),
      best: [...pieces].sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 5),
      formats: [...formats]
        .map(([format, f]) => ({
          format,
          pieces: f.n,
          medianRatio: Math.round(median(f.ratios) * 10) / 10,
        }))
        .sort((a, b) => b.medianRatio - a.medianRatio),
    };
  });
  const week = await radar(deps, {
    platform: 'all',
    region: 'global',
    untouched: true,
    audience: '30x',
  });
  return { profiles, gaps: week.topics.slice(0, 6) };
}

// ------------------------------------------------------------------ evaluation

export async function evaluationView(deps: Deps) {
  const path = join(deps.config.repoRoot, 'packages/core/fixtures/backtest/report.json');
  const backtest = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : null;
  const asOf = await asOfOf(deps);
  const byPlatform = await deps.db
    .select({
      platform: items.platform,
      pieces: sql<number>`count(*)::int`,
      creators: sql<number>`count(distinct ${items.authorId})::int`,
    })
    .from(items)
    .groupBy(items.platform);
  const [read] = await deps.db
    .select({
      n: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${enrichments.isAi})::int`,
    })
    .from(enrichments);
  const [topicCount] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(topics)
    .where(eq(topics.generic, false));
  const captures = await deps.db
    .select({ stats: runs.stats, startedAt: runs.startedAt })
    .from(runs)
    .where(eq(runs.kind, 'ingest'));
  // How long a wave takes to reach Spanish: for topics that stood out in English or Portuguese,
  // the weeks until Spanish stood out too (or until now, while it has not).
  const { scored } = await scoreTopics(deps);
  const lags = scored
    .filter((s) => s.spanishWindow.leader && s.spanishWindow.lagDays !== null && s.meta.named)
    .map((s) => ({
      name: s.meta.name,
      leader: s.spanishWindow.leader!,
      lagDays: s.spanishWindow.lagDays!,
      open: s.spanishWindow.open,
    }));
  const languageLag = {
    topics: lags.length,
    medianDays: lags.length ? median(lags.map((l) => l.lagDays)) : null,
    stillOpen: lags.filter((l) => l.open).length,
    examples: lags.sort((a, b) => b.lagDays - a.lagDays).slice(0, 6),
  };
  return {
    asOf,
    languageLag,
    backtest,
    corpus: {
      byPlatform: byPlatform.sort((a, b) => b.pieces - a.pieces),
      read: read?.n ?? 0,
      ai: read?.ai ?? 0,
      topics: topicCount?.n ?? 0,
      captures: captures.length,
    },
    cost: await weekCost(deps, asOf),
  };
}

// ------------------------------------------------------------------ ask

const AskSchema = z.object({
  answer: z.string(),
  refs: z.array(z.string()),
  followUps: z.array(z.string()),
});

const ASK_SYSTEM = `Eres el radar de contenido de 30X, una escuela de negocios de Latinoamérica que enseña IA a ejecutivos. Respondes preguntas del equipo de medios sobre qué temas de IA están creciendo, dónde, por qué y cómo contarlos.

Reglas:
- Responde solo con los datos del contexto: temas con su id, etapa, crecimiento, creadores, redes y encaje. Si algo no está, dilo y sugiere dónde mirarlo en el radar. Nunca inventes cifras.
- Español, texto plano sin markdown, breve: un párrafo corto o una lista corta con guiones.
- En el texto nombra los temas por su nombre, nunca por su id. Pon el id exacto de cada tema que menciones (empieza con t_) solo en "refs".
- Si la pregunta es por un uso (ventas, marketing, atención al cliente…), busca también en «Se están formando»: ahí están los temas que todavía no llegan a LinkedIn.
- Lo viral sobre IA suele nacer en inglés o portugués y llegar después al español. Cuando un tema tiene «ventana abierta», dilo: es la oportunidad de adaptarlo primero.
- "followUps": dos o tres preguntas útiles que el equipo podría hacer después.`;

export async function askRadar(
  deps: Deps,
  question: string,
  history: { question: string; answer: string }[] = [],
) {
  if (question.trim().length < 3) throw new AppError(400, 'bad_question', 'Escribe una pregunta.');
  const { scored } = await scoreTopics(deps);
  const ranked = scored.filter((s) => s.core.momentum > 0 && s.meta.named).slice(0, 40);
  // The ones that serve 30X's audience first, as on the radar's own lane.
  const forming = scored
    .filter((s) => s.forming && s.meta.named)
    .sort(
      (a, b) =>
        Number((b.meta.fit ?? 0) >= 7) - Number((a.meta.fit ?? 0) >= 7) ||
        b.core.technicalLift - a.core.technicalLift,
    )
    .slice(0, 12);
  const langLine = (s: (typeof scored)[number]) =>
    `idiomas: inglés ${s.languages.en.creators}, portugués ${s.languages.pt.creators}, español ${s.languages.es.creators} creadores${s.spanishWindow.open ? ' | ventana abierta: ya es viral en ' + (s.spanishWindow.leader === 'pt' ? 'portugués' : 'inglés') + ' y casi no hay piezas en español' : ''}`;
  const line = (s: (typeof scored)[number]) =>
    `- ${s.core.id} | ${s.meta.name} | etapa ${s.stage} | ${s.core.growthPct >= 0 ? '+' : ''}${s.core.growthPct} % | ${s.core.creators} creadores | redes esta semana: ${s.platforms.join(', ') || 'ninguna'} | encaje 30X ${s.meta.fit ?? 'sin medir'}${s.untouched ? ' | 30X no lo ha tocado' : ''}${s.meta.why ? ` | por qué: ${s.meta.why}` : ''} | ${langLine(s)}`;
  const context = [
    'Temas que más crecen esta semana (de mayor a menor momentum):',
    ...ranked.map(line),
    '',
    'Se están formando en el carril técnico (aún no llegan a LinkedIn ni a Instagram):',
    ...forming.map(line),
  ].join('\n');
  const conversation = history
    .slice(-4)
    .map((t) => `Pregunta anterior: ${t.question}\nTu respuesta: ${t.answer}`)
    .join('\n\n');
  const result = await deps.llm.complete({
    name: 'ask',
    system: ASK_SYSTEM,
    user: `${context}\n\n${conversation ? `${conversation}\n\n` : ''}Pregunta: ${question.trim()}`,
    schema: AskSchema,
    maxTokens: 6000,
    reasoningEffort: 'low',
  });
  const known = new Map(scored.map((s) => [s.core.id, s.meta.name]));
  return {
    answer: result.answer,
    refs: [...new Set(result.refs)]
      .filter((id) => known.has(id))
      .slice(0, 6)
      .map((id) => ({ ref: id, label: known.get(id)!, href: `/tema/${id}`, external: false })),
    followUps: result.followUps.slice(0, 3),
  };
}
