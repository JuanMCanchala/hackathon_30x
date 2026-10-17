/**
 * Reads each piece once with the language model: is it about AI, which concrete topics it
 * talks about, and the traits that explain performance (hook, format, emotion, audience, who
 * wrote it). The model only labels; every number the radar shows is computed in code.
 */
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { enrichments, items } from '../db/schema';
import type { Deps } from '../services/deps';

/** Changing the prompt or the schema bumps this, and pieces are read again. */
export const ENRICH_VERSION = 'e1';
const BATCH = 20;
const PARALLEL = Number(process.env.ENRICH_PARALLEL ?? 16);
/**
 * Pieces older than this only need their topic (to count past weeks), not the traits that
 * explain performance: they get a light read, 50 per call, at a fraction of the tokens.
 */
const RECENT_DAYS = 16;
const LIGHT_BATCH = 50;
export const LIGHT_VERSION = 'e1-light';
/** Only the weeks the radar looks at: the current one, the eight before it, and some margin. */
const HORIZON_DAYS = 70;
/**
 * Feeds that are not about AI by construction (Hacker News, GitHub, newsletters, launches) only
 * reach the model when their text mentions AI; the searches already asked about AI.
 */
const AI_WORDS =
  '\\m(ai|a\\.i\\.|ia|llms?|gpt|chatgpt|openai|anthropic|claude|gemini|copilot|deepseek|qwen|llama|mistral|agentic|agents?|agentes?|machine learning|deep learning|neural|inteligencia artificial|artificial intelligence|genai|generative|generativa|diffusion|transformers?|rag|mcp|embeddings?|prompts?|sora|midjourney|veo|nvidia|robots?|automation|automatización)';
const OPEN_FEEDS = ['hn', 'github', 'newsletter', 'producthunt', 'arxiv'];

export const HOOK_TYPES = [
  'cifra',
  'pregunta',
  'contraintuitivo',
  'lista',
  'historia',
  'tutorial',
  'noticia',
  'opinion',
  'comparacion',
  'demo',
  'otro',
] as const;
export const EMOTIONS = [
  'asombro',
  'utilidad',
  'miedo',
  'ambicion',
  'humor',
  'polemica',
  'inspiracion',
  'neutral',
] as const;
export const AUDIENCES = ['ejecutivo', 'tecnico', 'general'] as const;
export const AUTHOR_TYPES = [
  'empresa',
  'creador',
  'medio',
  'ejecutivo',
  'tecnico',
  'comunidad',
] as const;
export const USE_CASES = [
  'ventas',
  'marketing',
  'productividad',
  'operaciones',
  'finanzas',
  'talento',
  'desarrollo',
  'educacion',
  'estrategia',
  'producto',
  'otro',
] as const;

const PieceSchema = z.object({
  n: z.number().int(),
  isAi: z.boolean(),
  labels: z.array(z.string()),
  hookType: z.enum(HOOK_TYPES),
  hook: z.string(),
  emotion: z.enum(EMOTIONS),
  audience: z.enum(AUDIENCES),
  authorType: z.enum(AUTHOR_TYPES),
  useCase: z.enum(USE_CASES),
  lang: z.string(),
  country: z.string().nullable(),
});
const BatchSchema = z.object({ pieces: z.array(PieceSchema) });
const LightSchema = z.object({
  pieces: z.array(
    z.object({ n: z.number().int(), isAi: z.boolean(), labels: z.array(z.string()) }),
  ),
});

const SYSTEM = `Eres analista de contenido de 30X, una escuela de negocios de Latinoamérica que enseña IA a ejecutivos y equipos. Recibes piezas públicas (posts, videos, tweets, repos, papers, titulares) y etiquetas cada una. No opinas: describes lo que hay.

Para cada pieza devuelve:
- isAi: true si la pieza trata principalmente de inteligencia artificial (modelos, agentes, herramientas, usos, regulación, empresas de IA). Si la IA es solo una mención de pasada, false.
- labels: de 1 a 3 temas concretos, en español, de 2 a 5 palabras, en minúsculas salvo nombres propios. Como los buscaría un ejecutivo: "agentes de IA para ventas", "Sora 2", "vibe coding", "regulación de IA en Europa", "Claude Code", "IA y empleo juvenil". Si nombra un producto, modelo o empresa nuevo, úsalo tal cual. NUNCA etiquetas genéricas como "inteligencia artificial", "IA", "tecnología", "innovación", "futuro". Si isAi es false, labels vacío.
- hookType: cómo abre la pieza: cifra, pregunta, contraintuitivo, lista, historia (personal), tutorial (cómo hacer), noticia, opinion, comparacion, demo (muestra algo funcionando) u otro.
- hook: la primera frase o el gancho, textual y corto (máximo 140 caracteres).
- emotion: lo que busca provocar: asombro, utilidad, miedo, ambicion, humor, polemica, inspiracion o neutral.
- audience: ejecutivo (decisiones de negocio, sin código), tecnico (construye con código) o general (consumidor).
- authorType: empresa, creador (de contenido), medio, ejecutivo (líder que publica a título personal), tecnico (desarrollador o investigador) o comunidad.
- useCase: el uso de negocio principal, o otro.
- lang: código ISO 639-1 del texto.
- country: código ISO del país al que se refiere o del autor si es evidente; si no, null.

Devuelve una entrada por pieza con su número n.`;

const LIGHT_SYSTEM = `Eres analista de contenido de 30X, una escuela de negocios de Latinoamérica que enseña IA a ejecutivos. Recibes piezas públicas y para cada una devuelves:
- isAi: true si trata principalmente de inteligencia artificial; si la IA es solo una mención de pasada, false.
- labels: de 1 a 3 temas concretos, en español, de 2 a 5 palabras, en minúsculas salvo nombres propios, como los buscaría un ejecutivo: "agentes de IA para ventas", "Sora 2", "vibe coding", "Claude Code". Usa el nombre exacto de productos, modelos y empresas. NUNCA etiquetas genéricas como "inteligencia artificial", "IA", "tecnología" o "innovación". Si isAi es false, labels vacío.

Devuelve una entrada por pieza con su número n.`;

type ItemRow = typeof items.$inferSelect;

function describe(item: ItemRow, n: number, max = 700): string {
  const body = [item.title, item.text]
    .filter(Boolean)
    .join(' — ')
    .replace(/\s+/g, ' ')
    .slice(0, max);
  return `[${n}] ${item.platform} · ${item.format} · ${item.authorName}${item.authorHandle ? ` (@${item.authorHandle})` : ''}\n${body}`;
}

/** Pieces not read yet with the current prompt, the most engaging first. */
async function pending(deps: Deps, limit: number): Promise<ItemRow[]> {
  return deps.db
    .select({ item: items })
    .from(items)
    .leftJoin(enrichments, eq(enrichments.itemId, items.id))
    .where(
      and(
        or(
          isNull(enrichments.itemId),
          notInArray(enrichments.version, [ENRICH_VERSION, LIGHT_VERSION]),
        ),
        sql`${items.publishedAt} >= now() - make_interval(days => ${HORIZON_DAYS})`,
        or(
          sql`${items.platform} not in (${sql.join(
            OPEN_FEEDS.map((p) => sql`${p}`),
            sql`, `,
          )})`,
          sql`(coalesce(${items.title}, '') || ' ' || ${items.text}) ~* ${AI_WORDS}`,
        ),
      ),
    )
    .orderBy(desc(items.engagement))
    .limit(limit)
    .then((rows) => rows.map((r) => r.item));
}

const cleanLabels = (isAi: boolean, labels: string[]) =>
  isAi
    ? [...new Set(labels.map((l) => l.trim().replace(/[.。]+$/, '')).filter(Boolean))].slice(0, 3)
    : [];

async function save(deps: Deps, row: typeof enrichments.$inferInsert) {
  await deps.db
    .insert(enrichments)
    .values(row)
    .onConflictDoUpdate({ target: enrichments.itemId, set: row });
}

async function enrichBatch(deps: Deps, batch: ItemRow[], light = false): Promise<number> {
  const now = deps.clock.now().toISOString();
  let saved = 0;
  if (light) {
    const user = batch.map((item, i) => describe(item, i + 1, 280)).join('\n\n');
    const result = await deps.llm.complete({
      name: 'enrich-light',
      system: LIGHT_SYSTEM,
      user,
      schema: LightSchema,
      maxTokens: 8000,
      reasoningEffort: 'none',
    });
    const byN = new Map(result.pieces.map((p) => [p.n, p]));
    for (const [i, item] of batch.entries()) {
      const p = byN.get(i + 1);
      if (!p) continue;
      await save(deps, {
        itemId: item.id,
        version: LIGHT_VERSION,
        isAi: p.isAi,
        labels: cleanLabels(p.isAi, p.labels),
        format: item.format,
        lang: item.lang,
        createdAt: now,
      });
      saved += 1;
    }
    return saved;
  }
  const user = batch.map((item, i) => describe(item, i + 1)).join('\n\n');
  const result = await deps.llm.complete({
    name: 'enrich',
    system: SYSTEM,
    user,
    schema: BatchSchema,
    maxTokens: 8000,
    reasoningEffort: 'none',
  });
  const byN = new Map(result.pieces.map((p) => [p.n, p]));
  for (const [i, item] of batch.entries()) {
    const p = byN.get(i + 1);
    if (!p) continue;
    await save(deps, {
      itemId: item.id,
      version: ENRICH_VERSION,
      isAi: p.isAi,
      labels: cleanLabels(p.isAi, p.labels),
      format: item.format,
      hookType: p.hookType,
      hook: p.hook.slice(0, 200),
      emotion: p.emotion,
      audience: p.audience,
      authorType: p.authorType,
      useCase: p.useCase,
      lang: p.lang.slice(0, 5),
      country: p.country,
      createdAt: now,
    });
    saved += 1;
  }
  return saved;
}

/** Reads the given pieces now, whatever their state (a post sent through the sensor). */
export async function enrichItems(deps: Deps, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = await deps.db.select().from(items).where(inArray(items.id, ids));
  return enrichBatch(deps, rows);
}

/** Reads up to `limit` pending pieces, a few batches at a time. */
export async function enrichPending(
  deps: Deps,
  options: { limit?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<{ read: number; failed: number }> {
  const todo = await pending(deps, options.limit ?? 5000);
  // Recent pieces first, read in full; older ones only for their topic.
  const cutoff = deps.clock.now().getTime() - RECENT_DAYS * 86_400_000;
  const recent = todo.filter((i) => Date.parse(i.publishedAt) >= cutoff);
  const old = todo.filter((i) => Date.parse(i.publishedAt) < cutoff);
  const batches: { items: ItemRow[]; light: boolean }[] = [];
  for (let i = 0; i < recent.length; i += BATCH)
    batches.push({ items: recent.slice(i, i + BATCH), light: false });
  for (let i = 0; i < old.length; i += LIGHT_BATCH)
    batches.push({ items: old.slice(i, i + LIGHT_BATCH), light: true });
  let read = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      try {
        const n = await enrichBatch(deps, batch.items, batch.light);
        read += n;
      } catch (error) {
        failed += batch.items.length;
        console.error(
          `enrich: lote fallido (${batch.items.length} piezas):`,
          (error as Error).message,
        );
      }
      options.onProgress?.(read + failed, todo.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return { read, failed };
}

/** How many pieces are read with the current prompt, and how many are about AI. */
export async function enrichmentStats(deps: Deps) {
  const [row] = await deps.db
    .select({
      read: sql<number>`count(*)::int`,
      ai: sql<number>`count(*) filter (where ${enrichments.isAi})::int`,
    })
    .from(enrichments)
    .where(inArray(enrichments.version, [ENRICH_VERSION, LIGHT_VERSION]));
  return row ?? { read: 0, ai: 0 };
}
