/**
 * "Cómo lo contamos": a growing topic turned into pieces 30X can publish, in its voice and for
 * its audience, built on the hooks that worked and avoiding the angles everyone already used.
 * A person approves each one before it reaches the calendar; nothing is ever published alone.
 */
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { adaptations, approvals, topics } from '../db/schema';
import { newId, notFound } from '../lib/common';
import type { Deps } from './deps';
import { topicDetail } from './topic';

export const AdaptationSchema = z.object({
  angle: z.string(),
  hooks: z.array(z.string()),
  linkedin: z.string(),
  carousel: z.array(z.object({ title: z.string(), body: z.string() })),
  reel: z.object({
    hook: z.string(),
    beats: z.array(z.string()),
    onScreen: z.array(z.string()),
    cta: z.string(),
  }),
  youtube: z.object({ title: z.string(), thumbnail: z.string() }),
  avoid: z.array(z.string()),
  /** Ids of the English or Portuguese pieces the adaptation builds on. */
  inspiredBy: z.array(z.string()),
});
export type AdaptationContent = z.infer<typeof AdaptationSchema>;

/** 30X's voice, read from 30x.com and its reference profiles. */
export const VOICE = `Voz de 30X: ambiciosa, directa y práctica. Habla a fundadores, ejecutivos y equipos comerciales de Latinoamérica que quieren "construir ventajas injustas". Frases cortas, verbos de acción ("construye", "implementa", "mide"), casos concretos de empresas de la región, cero tecnicismos sin traducir, nada de hype vacío ("revolucionario", "cambia todo"). Tutea. Cierra con una acción concreta, no con una pregunta genérica. Andrés Bilbao (cofundador de Rappi y de 30X) escribe en primera persona, con historias de operador y números.`;

const ADAPT_SYSTEM = `Eres editor de contenido de 30X. Te damos un tema de IA que está creciendo, por qué funcionan las piezas que despegan (patrones contados y ejemplos) y si encaja con la audiencia. Escribe piezas listas para que una persona del equipo las revise y publique.

${VOICE}

Devuelve:
- angulo (en "angle"): el ángulo propio de 30X en una frase: por qué le importa a un ejecutivo latinoamericano y qué lo diferencia de lo que ya publicó todo el mundo.
- hooks: 3 ganchos distintos para abrir (uno con cifra, uno con pregunta, uno contraintuitivo), máximo 15 palabras cada uno.
- linkedin: un post para LinkedIn con la voz de Andrés Bilbao, de 120 a 220 palabras, con saltos de línea, sin hashtags de relleno (máximo 3 al final).
- carousel: de 6 a 8 láminas para Instagram, cada una con título corto (máximo 8 palabras) y texto (máximo 30 palabras). La primera es el gancho y la última la acción.
- reel: guion de Reel o TikTok de 30 a 45 segundos: hook (lo que se dice en los primeros 3 segundos), beats (4 a 6 momentos en orden), onScreen (texto en pantalla de cada momento) y cta.
- youtube: título (máximo 70 caracteres) e idea de miniatura (qué se ve y el texto grande, máximo 4 palabras).
- avoid: 2 o 3 ángulos que ya están gastados o que no le convienen a la marca.

- inspiredBy: los ids de las piezas en inglés o portugués en las que te basaste (copiados exactos), o una lista vacía.

Lo viral sobre IA casi siempre nace en inglés o en portugués y llega días después al español. Si te damos piezas que ya funcionaron en esos idiomas, adáptalas al español latinoamericano: toma la idea y el gancho, no traduzcas palabra por palabra, cambia los ejemplos por casos de la región y dilo con la voz de 30X.

Usa solo hechos que estén en los datos o que sean de conocimiento general; si citas una cifra, que venga de los datos. Español latinoamericano neutro, sin markdown.`;

export interface AdaptationView extends AdaptationContent {
  id: string;
  topicId: string;
  variant: number;
  createdAt: string;
}

const view = (row: typeof adaptations.$inferSelect): AdaptationView => ({
  ...(row.payload as AdaptationContent),
  id: row.id,
  topicId: row.topicId,
  variant: row.variant,
  createdAt: row.createdAt,
});

export async function listAdaptations(deps: Deps, topicId: string): Promise<AdaptationView[]> {
  const rows = await deps.db
    .select()
    .from(adaptations)
    .where(eq(adaptations.topicId, topicId))
    .orderBy(desc(adaptations.createdAt));
  return rows.map(view);
}

/** Writes (or replays) the adaptation of a topic. `variant` > 0 asks for another version. */
export async function adaptTopic(
  deps: Deps,
  topicId: string,
  variant = 0,
  refresh = false,
): Promise<AdaptationView> {
  const [topic] = await deps.db.select().from(topics).where(eq(topics.id, topicId));
  if (!topic) throw notFound('El tema');
  const detail = await topicDetail(deps, topicId);
  if (refresh) {
    await deps.db
      .delete(adaptations)
      .where(and(eq(adaptations.topicId, topicId), eq(adaptations.variant, variant)));
  }
  const existing = await deps.db
    .select()
    .from(adaptations)
    .where(and(eq(adaptations.topicId, topicId), eq(adaptations.variant, variant)));
  if (existing[0]) return view(existing[0]);

  const t = detail.topic;
  const user = [
    `Tema: ${t.name}${t.definition ? ` — ${t.definition}` : ''}`,
    `Etapa: ${t.stage}; momento recomendado: ${t.timing}; crecimiento ${t.growthPct >= 0 ? '+' : ''}${t.growthPct} %; ${t.creators} creadores esta semana.`,
    t.why ? `Por qué crece: ${t.why}` : '',
    detail.why.narrative
      ? `Por qué funcionan las piezas que despegan: ${detail.why.narrative}`
      : '',
    detail.why.patterns.length
      ? `Patrones contados:\n${detail.why.patterns.map((p) => `- ${p.label}`).join('\n')}`
      : '',
    detail.fit
      ? `Encaje con 30X: ${detail.fit.score}/10, pilar ${detail.fit.pillar}, riesgo de hype ${detail.fit.hypeRisk}. ${detail.fit.reasons.join(' ')}`
      : '',
    'Piezas que despegaron (gancho y red):',
    ...detail.evidence
      .slice(0, 6)
      .map((p) => `- ${p.platform}: «${(p.hook || p.title || p.text).slice(0, 160)}»`),
    detail.inspiration.length
      ? `Ya funcionó en inglés o portugués (adáptalo al español):\n${detail.inspiration
          .map(
            (p) =>
              `- [${p.id}] ${p.lang === 'pt' ? 'portugués' : 'inglés'}, ${p.platform}: «${(p.hook || p.title || p.text).slice(0, 160)}»${p.es ? ` (en español: «${p.es}»)` : ''}`,
          )
          .join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  const content = await deps.llm.complete({
    name: 'adapt',
    system: ADAPT_SYSTEM,
    user,
    schema: AdaptationSchema,
    maxTokens: 9000,
    variant,
    reasoningEffort: 'low',
  });
  const row = {
    id: newId('adp'),
    topicId,
    week: detail.weekly.at(-1)?.week ?? deps.clock.now().toISOString().slice(0, 10),
    variant,
    payload: content,
    createdAt: deps.clock.now().toISOString(),
  };
  await deps.db.insert(adaptations).values(row);
  return view(row);
}

const FORMAT_COPY: Record<string, string> = {
  linkedin: 'Post de LinkedIn',
  carousel: 'Carrusel de Instagram',
  reel: 'Reel o TikTok',
  youtube: 'Video de YouTube',
};

/** The text a format puts on the calendar: what the person will actually publish. */
function bodyOf(a: AdaptationContent, format: string): { title: string; body: string } {
  if (format === 'carousel')
    return {
      title: a.carousel[0]?.title ?? a.angle,
      body: a.carousel.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n'),
    };
  if (format === 'reel')
    return {
      title: a.reel.hook,
      body: [
        `Gancho: ${a.reel.hook}`,
        ...a.reel.beats.map((b, i) => `${i + 1}. ${b} [${a.reel.onScreen[i] ?? ''}]`),
        `Cierre: ${a.reel.cta}`,
      ].join('\n'),
    };
  if (format === 'youtube')
    return { title: a.youtube.title, body: `Miniatura: ${a.youtube.thumbnail}` };
  return { title: a.hooks[0] ?? a.angle, body: a.linkedin };
}

export async function approve(
  deps: Deps,
  input: { adaptationId: string; format: string; scheduledFor: string; approvedBy: string },
) {
  const [row] = await deps.db
    .select()
    .from(adaptations)
    .where(eq(adaptations.id, input.adaptationId));
  if (!row) throw notFound('La adaptación');
  const { title, body } = bodyOf(row.payload as AdaptationContent, input.format);
  const entry = {
    id: newId('cal'),
    adaptationId: row.id,
    topicId: row.topicId,
    format: FORMAT_COPY[input.format] ?? input.format,
    title,
    body,
    scheduledFor: input.scheduledFor,
    approvedBy: input.approvedBy,
    approvedAt: deps.clock.now().toISOString(),
  };
  await deps.db.insert(approvals).values(entry);
  deps.bus.publish({ type: 'calendar.changed', at: entry.approvedAt, data: { id: entry.id } });
  return entry;
}

export async function calendar(deps: Deps) {
  const rows = await deps.db
    .select({ entry: approvals, topicName: topics.name })
    .from(approvals)
    .innerJoin(topics, eq(topics.id, approvals.topicId))
    .orderBy(approvals.scheduledFor, approvals.approvedAt);
  return rows.map((r) => ({ ...r.entry, topicName: r.topicName }));
}

export async function unschedule(deps: Deps, id: string) {
  const deleted = await deps.db.delete(approvals).where(eq(approvals.id, id)).returning();
  if (!deleted.length) throw notFound('La publicación');
  deps.bus.publish({ type: 'calendar.changed', at: deps.clock.now().toISOString(), data: { id } });
  return { ok: true };
}
