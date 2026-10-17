/**
 * From labels to topics. Every distinct label the model wrote is embedded once and joins the
 * most similar topic, or opens a new one; topic ids stay stable across runs. New topics are
 * then named by the model from their labels and a few of their pieces.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assignToTopics, canonical, type TopicCentroid } from '@radar/core';
import { enrichments, itemTopics, items, topicLabels, topics } from '../db/schema';
import type { Deps } from '../services/deps';

/**
 * Similarity needed to join a topic. Higher than the 0.7 of BERTrend: a trend is a concrete
 * thing ("Sora 2", "agentes de IA para ventas"), and 0.7 folds those into "IA" in general.
 */
export const JOIN_THRESHOLD = 0.8;
/** Pieces a label needs before it counts: one-off labels are noise, not trends. */
export const MIN_LABEL_PIECES = 2;

/** Every AI label in use, with how many pieces carry it and how it was first written. */
async function labelCounts(deps: Deps) {
  const rows = await deps.db
    .select({ labels: enrichments.labels })
    .from(enrichments)
    .where(eq(enrichments.isAi, true));
  const counts = new Map<string, { text: string; count: number }>();
  for (const row of rows) {
    for (const text of row.labels) {
      const key = canonical(text);
      if (!key) continue;
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { text, count: 1 });
    }
  }
  return counts;
}

/** Assigns new labels to topics and rebuilds the piece–topic links. */
export async function clusterLabels(deps: Deps): Promise<{ newLabels: number; newTopics: number }> {
  const counts = await labelCounts(deps);
  const known = new Set(
    (await deps.db.select({ label: topicLabels.label }).from(topicLabels)).map((r) => r.label),
  );
  // A trend repeats by definition: a label written for a single piece cannot open or join a
  // topic. The rule holds for every week alike, so it does not bias growth.
  const fresh = [...counts].filter(([key, v]) => !known.has(key) && v.count >= MIN_LABEL_PIECES);
  let newTopics = 0;

  if (fresh.length) {
    const vectors = await deps.embedder.embed(fresh.map(([, v]) => v.text));
    const existingRows = await deps.db.select().from(topics);
    const labelsByTopic = new Map<string, string[]>();
    for (const r of await deps.db.select().from(topicLabels)) {
      const list = labelsByTopic.get(r.topicId) ?? [];
      list.push(r.label);
      labelsByTopic.set(r.topicId, list);
    }
    const existing: TopicCentroid[] = existingRows.map((t) => ({
      id: t.id,
      label: labelsByTopic.get(t.id)?.[0] ?? t.name,
      ...(t.leader ? { leader: t.leader } : {}),
      centroid: t.centroid,
      size: t.labelCount,
      labels: (labelsByTopic.get(t.id) ?? []).sort(),
    }));
    const result = assignToTopics(
      fresh.map(([key, v], i) => ({ label: key, vector: vectors[i]!, weight: v.count })),
      existing,
      JOIN_THRESHOLD,
    );
    const now = deps.clock.now().toISOString();
    const before = new Set(existing.map((t) => t.id));
    for (const t of result.topics) {
      if (before.has(t.id)) {
        await deps.db
          .update(topics)
          .set({ centroid: t.centroid, labelCount: Math.round(t.size) })
          .where(eq(topics.id, t.id));
      } else {
        newTopics += 1;
        await deps.db.insert(topics).values({
          id: t.id,
          name: counts.get(t.label)?.text ?? t.label,
          leader: t.leader ?? t.centroid,
          centroid: t.centroid,
          labelCount: Math.round(t.size),
          createdAt: now,
        });
      }
    }
    for (let i = 0; i < result.assignments.length; i += 500) {
      await deps.db
        .insert(topicLabels)
        .values(
          result.assignments.slice(i, i + 500).map((a) => ({
            label: a.label,
            topicId: a.topicId,
            similarity: a.similarity,
          })),
        )
        .onConflictDoNothing();
    }
  }

  // Piece–topic links follow the labels: rebuilt in full, cheap at this size, and with the same
  // canonical form the topics were built with.
  const topicOf = new Map(
    (await deps.db.select().from(topicLabels)).map((r) => [r.label, r.topicId] as const),
  );
  const links = new Map<string, { itemId: string; topicId: string }>();
  for (const row of await deps.db
    .select({ itemId: enrichments.itemId, labels: enrichments.labels })
    .from(enrichments)
    .where(eq(enrichments.isAi, true))) {
    for (const text of row.labels) {
      const topicId = topicOf.get(canonical(text));
      if (topicId) links.set(`${row.itemId}|${topicId}`, { itemId: row.itemId, topicId });
    }
  }
  await deps.db.delete(itemTopics);
  const all = [...links.values()];
  for (let i = 0; i < all.length; i += 1000) {
    await deps.db
      .insert(itemTopics)
      .values(all.slice(i, i + 1000))
      .onConflictDoNothing();
  }
  return { newLabels: fresh.length, newTopics };
}

const NameSchema = z.object({
  topics: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      definition: z.string(),
      wikipedia: z.string().nullable(),
      queries: z.array(z.string()),
      generic: z.boolean(),
    }),
  ),
});

const NAME_SYSTEM = `Nombras temas de contenido sobre IA para el equipo de medios de 30X (escuela de negocios de Latinoamérica para ejecutivos). Cada tema llega con las etiquetas que lo forman y algunas piezas de ejemplo.

Para cada tema devuelve:
- name: nombre corto en español (máximo 5 palabras), concreto y reconocible, como un titular de sección: "Sora 2", "Agentes de IA para ventas", "Claude Code", "IA y empleo juvenil". Respeta nombres propios de productos y empresas.
- definition: una frase (máximo 25 palabras) que explique de qué se trata para un ejecutivo.
- wikipedia: el título exacto del artículo de Wikipedia en inglés que mejor lo representa, o null si no hay uno claro.
- queries: 3 búsquedas cortas (2 a 4 palabras) para encontrar más piezas del tema, mezclando español e inglés.
- generic: true si el tema es demasiado amplio para ser una tendencia ("inteligencia artificial", "tecnología", "IA en empresas" en general, "futuro del trabajo" sin más). false si es algo concreto que puede subir o bajar.

Devuelve una entrada por tema con su id.`;

/** Names topics that have pieces but no name from the model yet, the biggest first. */
export async function nameTopics(deps: Deps, limit = 300): Promise<number> {
  const pending = await deps.db
    .select({ id: topics.id, pieces: sql<number>`count(${itemTopics.itemId})::int` })
    .from(topics)
    .innerJoin(itemTopics, eq(itemTopics.topicId, topics.id))
    .where(eq(topics.named, false))
    .groupBy(topics.id)
    .having(sql`count(${itemTopics.itemId}) >= 2`)
    .orderBy(desc(sql`count(${itemTopics.itemId})`))
    .limit(limit);
  let named = 0;
  const batches: (typeof pending)[] = [];
  for (let i = 0; i < pending.length; i += 20) batches.push(pending.slice(i, i + 20));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      const ids = batch.map((b) => b.id);
      const labels = await deps.db
        .select()
        .from(topicLabels)
        .where(inArray(topicLabels.topicId, ids));
      const samples = await deps.db
        .select({
          topicId: itemTopics.topicId,
          title: items.title,
          text: items.text,
          engagement: items.engagement,
        })
        .from(itemTopics)
        .innerJoin(items, eq(items.id, itemTopics.itemId))
        .where(inArray(itemTopics.topicId, ids))
        .orderBy(desc(items.engagement));
      const user = batch
        .map((b) => {
          const ls = labels
            .filter((l) => l.topicId === b.id)
            .map((l) => l.label)
            .slice(0, 10);
          const ex = samples
            .filter((s) => s.topicId === b.id)
            .slice(0, 3)
            .map((s) => `  - ${(s.title || s.text).replace(/\s+/g, ' ').slice(0, 160)}`);
          return `id: ${b.id} (${b.pieces} piezas)\netiquetas: ${ls.join('; ')}\nejemplos:\n${ex.join('\n')}`;
        })
        .join('\n\n');
      try {
        const result = await deps.llm.complete({
          name: 'name-topics',
          system: NAME_SYSTEM,
          user,
          schema: NameSchema,
          maxTokens: 6000,
          reasoningEffort: 'none',
        });
        for (const t of result.topics) {
          if (!ids.includes(t.id)) continue;
          await deps.db
            .update(topics)
            .set({
              name: t.name.trim(),
              definition: t.definition.trim(),
              wikipedia: t.wikipedia,
              queries: t.queries.slice(0, 3),
              generic: t.generic,
              named: true,
            })
            .where(and(eq(topics.id, t.id)));
          named += 1;
        }
      } catch (error) {
        console.error('name-topics: lote fallido:', (error as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return named;
}
