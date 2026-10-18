/**
 * "Cómo lo contamos": a growing topic turned into pieces 30X can publish, in its voice and for
 * its audience, built on the hooks that worked and avoiding the angles everyone already used.
 * A person approves each one before it reaches the calendar; nothing is ever published alone.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { adaptations, approvals, maquetas, topics, watchHits, watches } from '../db/schema';
import { AppError, badRequest, iso, newId, notFound } from '../lib/common';
import { nowIso, type Deps } from './deps';
import { maquetaView, type MaquetaOrigin, type MaquetaSlide, type MaquetaView } from './maquetas';
import { cameWithDemo, importedAt } from './snapshot';
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
  createdAt: iso(row.createdAt)!,
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

/** The same words for a maqueta's format. */
const MAQUETA_FORMAT_COPY: Record<string, string> = {
  carrusel: 'Carrusel de Instagram',
  post: 'Post de Instagram',
  historia: 'Historia o Reel',
  portada: 'Video de YouTube',
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

/** Where a piece Vigía caught was found, kept on the calendar entry made from it. */
export interface VigiaOrigin {
  kind: 'vigia';
  watchId: string;
  itemId: string;
  term: string;
}

export interface CalendarEntry {
  id: string;
  adaptationId: string | null;
  topicId: string | null;
  /** The topic's name, else the Vigía term, else the maqueta's name, else «Sin tema». */
  topicName: string;
  format: string;
  title: string;
  body: string;
  scheduledFor: string;
  /** 'HH:MM', 24 h, Bogotá time. */
  scheduledTime: string | null;
  approvedBy: string;
  approvedAt: string;
  maquetaId: string | null;
  /** The maqueta's current design, for the thumbnail. */
  maqueta: MaquetaView | null;
  origin: VigiaOrigin | null;
  /** False for the demo week's own pieces: only an admin moves or removes those. */
  removable: boolean;
}

/** One of three sources: a maqueta wins over an adaptation, an adaptation over a Vigía piece. */
export interface ApproveInput {
  adaptationId?: string;
  maquetaId?: string;
  watchId?: string;
  itemId?: string;
  /** linkedin | carousel | reel | youtube: needed with an adaptation or a Vigía piece. */
  format?: string;
  scheduledFor: string;
  scheduledTime?: string | null;
  approvedBy: string;
}

/** What a source puts on the calendar: the text and where it came from. */
type Draft = Pick<
  typeof approvals.$inferInsert,
  'adaptationId' | 'topicId' | 'maquetaId' | 'format' | 'title' | 'body' | 'origin'
>;

const formatOf = (format: string | undefined): string => {
  if (!format) throw badRequest('Falta el formato: linkedin, carousel, reel o youtube.');
  return format;
};

async function fromAdaptation(deps: Deps, id: string, format: string): Promise<Draft> {
  const [row] = await deps.db.select().from(adaptations).where(eq(adaptations.id, id));
  if (!row) throw notFound('La adaptación');
  return {
    adaptationId: row.id,
    topicId: row.topicId,
    maquetaId: null,
    format: FORMAT_COPY[format] ?? format,
    ...bodyOf(row.payload as AdaptationContent, format),
    origin: null,
  };
}

/** The maqueta's slides as text, the way a carousel goes on the calendar. */
async function fromMaqueta(deps: Deps, id: string): Promise<Draft> {
  const [row] = await deps.db.select().from(maquetas).where(eq(maquetas.id, id));
  if (!row) throw notFound('La maqueta');
  const slides = row.slides as MaquetaSlide[];
  const origin = row.origin as MaquetaOrigin | null;
  // The origin came from the designer's browser: only an adaptation that exists is linked.
  const [adaptation] =
    origin?.kind === 'topic' && origin.adaptationId
      ? await deps.db
          .select({ id: adaptations.id })
          .from(adaptations)
          .where(eq(adaptations.id, origin.adaptationId))
      : [];
  const caught: VigiaOrigin | null =
    origin?.kind === 'vigia'
      ? { kind: 'vigia', watchId: origin.watchId, itemId: origin.itemId, term: origin.name }
      : null;
  return {
    adaptationId: adaptation?.id ?? null,
    topicId: origin?.kind === 'topic' ? origin.topicId : null,
    maquetaId: row.id,
    format: MAQUETA_FORMAT_COPY[row.format] ?? row.format,
    title: slides[0]?.title ?? row.name,
    body: slides.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`).join('\n\n'),
    origin: caught,
  };
}

/** A piece Vigía caught, in the Spanish version someone already asked for. */
async function fromVigia(
  deps: Deps,
  watchId: string,
  itemId: string,
  format: string,
): Promise<Draft> {
  const [row] = await deps.db
    .select({ adaptation: watchHits.adaptation, term: watches.term })
    .from(watchHits)
    .innerJoin(watches, eq(watches.id, watchHits.watchId))
    .where(and(eq(watchHits.watchId, watchId), eq(watchHits.itemId, itemId)));
  if (!row) throw notFound('La pieza');
  if (!row.adaptation) throw new AppError(409, 'not_adapted', 'Primero adapta la pieza.');
  const origin: VigiaOrigin = { kind: 'vigia', watchId, itemId, term: row.term };
  return {
    adaptationId: null,
    topicId: null,
    maquetaId: null,
    format: FORMAT_COPY[format] ?? format,
    ...bodyOf(row.adaptation as AdaptationContent, format),
    origin,
  };
}

/** Puts an approved piece on the calendar. A day holds as many as the team wants. */
export async function approve(deps: Deps, input: ApproveInput): Promise<CalendarEntry> {
  const draft = input.maquetaId
    ? await fromMaqueta(deps, input.maquetaId)
    : input.adaptationId
      ? await fromAdaptation(deps, input.adaptationId, formatOf(input.format))
      : input.watchId && input.itemId
        ? await fromVigia(deps, input.watchId, input.itemId, formatOf(input.format))
        : null;
  if (!draft)
    throw badRequest('Falta qué programar: una adaptación, una maqueta o una pieza de Vigía.');
  const id = newId('cal');
  const approvedAt = nowIso(deps);
  await deps.db.insert(approvals).values({
    id,
    ...draft,
    scheduledFor: input.scheduledFor,
    scheduledTime: input.scheduledTime ?? null,
    approvedBy: input.approvedBy,
    approvedAt,
  });
  deps.bus.publish({ type: 'calendar.changed', at: approvedAt, data: { id } });
  return (await entries(deps, id))[0]!;
}

/** By day, then hour (pieces without one close the day), then approval. */
async function entries(deps: Deps, id?: string): Promise<CalendarEntry[]> {
  const rows = await deps.db
    .select({ entry: approvals, topicName: topics.name, maqueta: maquetas })
    .from(approvals)
    .leftJoin(topics, eq(topics.id, approvals.topicId))
    .leftJoin(maquetas, eq(maquetas.id, approvals.maquetaId))
    .where(id ? eq(approvals.id, id) : undefined)
    .orderBy(
      approvals.scheduledFor,
      sql`${approvals.scheduledTime} asc nulls last`,
      approvals.approvedAt,
    );
  const loadedAt = await importedAt(deps);
  return rows.map(({ entry, topicName, maqueta }) => {
    const origin = (entry.origin ?? null) as VigiaOrigin | null;
    return {
      id: entry.id,
      adaptationId: entry.adaptationId,
      topicId: entry.topicId,
      topicName: topicName ?? origin?.term ?? maqueta?.name ?? 'Sin tema',
      format: entry.format,
      title: entry.title,
      body: entry.body,
      scheduledFor: entry.scheduledFor,
      scheduledTime: entry.scheduledTime,
      approvedBy: entry.approvedBy,
      approvedAt: iso(entry.approvedAt)!,
      maquetaId: entry.maquetaId,
      maqueta: maqueta ? maquetaView(maqueta, loadedAt) : null,
      origin,
      removable: !cameWithDemo(entry.approvedAt, loadedAt),
    };
  });
}

export async function calendar(deps: Deps): Promise<CalendarEntry[]> {
  return entries(deps);
}

/** Moves a piece to another day, another hour, or both. */
export async function reschedule(
  deps: Deps,
  id: string,
  to: { scheduledFor?: string; scheduledTime?: string | null },
): Promise<CalendarEntry> {
  if (to.scheduledFor === undefined && to.scheduledTime === undefined)
    throw badRequest('Indica el día o la hora nueva.');
  const moved = await deps.db
    .update(approvals)
    .set({ scheduledFor: to.scheduledFor, scheduledTime: to.scheduledTime })
    .where(eq(approvals.id, id))
    .returning({ id: approvals.id });
  if (!moved.length) throw notFound('La publicación');
  deps.bus.publish({ type: 'calendar.changed', at: nowIso(deps), data: { id } });
  return (await entries(deps, id))[0]!;
}

/**
 * A piece the demo week came with (approved before its snapshot was loaded). Visitors move and
 * remove the ones they planned; only an admin moves or removes these.
 */
export async function isDemoEntry(deps: Deps, id: string): Promise<boolean> {
  const [row] = await deps.db
    .select({ approvedAt: approvals.approvedAt })
    .from(approvals)
    .where(eq(approvals.id, id));
  return !!row && cameWithDemo(row.approvedAt, await importedAt(deps));
}

export async function unschedule(deps: Deps, id: string) {
  const deleted = await deps.db.delete(approvals).where(eq(approvals.id, id)).returning();
  if (!deleted.length) throw notFound('La publicación');
  deps.bus.publish({ type: 'calendar.changed', at: deps.clock.now().toISOString(), data: { id } });
  return { ok: true };
}
