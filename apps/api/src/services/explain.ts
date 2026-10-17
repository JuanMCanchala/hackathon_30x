/**
 * The written half of a topic: why it grows and whether it serves 30X's audience. The model
 * writes from counts the code already made (feature lift, outlier ratios) and may only cite
 * pieces it was given; both answers are stored per topic and week.
 */
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { analyses } from '../db/schema';
import type { Deps } from './deps';

export const WhySchema = z.object({
  oneLiner: z.string(),
  narrative: z.string(),
  cited: z.array(z.string()),
});
export type Why = z.infer<typeof WhySchema>;

export const FitSchema = z.object({
  score: z.number().int().min(1).max(10),
  executive: z.number().int().min(1).max(10),
  noCode: z.number().int().min(1).max(10),
  latam: z.number().int().min(1).max(10),
  pillar: z.enum(['Ventas', 'Growth', 'Inteligencia Artificial', 'Next']),
  hypeRisk: z.enum(['bajo', 'medio', 'alto']),
  reasons: z.array(z.string()),
});
export type Fit = z.infer<typeof FitSchema>;

const WHY_SYSTEM = `Eres analista de contenido de 30X, una escuela de negocios de Latinoamérica que enseña IA a ejecutivos. Te damos un tema de IA que está creciendo, los patrones contados entre las piezas que despegaron (las que superan al menos 2 veces la mediana de su propio autor) frente al resto, y las piezas de evidencia con su id, red, autor, métricas y gancho.

Devuelve:
- oneLiner: por qué crece esta semana, en una frase de máximo 18 palabras: qué pasó (lanzamiento, noticia, caso) y quién lo está moviendo. Sin adjetivos vacíos.
- narrative: de 2 a 4 frases sobre por qué funcionan las piezas que despegan: el gancho, el formato, el momento y quién las publica. Usa las cifras de los patrones tal cual ("7 de 10 piezas que despegaron abren con una cifra"). Si no hay patrones con suficientes piezas, dilo y explica con la evidencia.
- cited: los ids de las piezas que mencionas o en las que te apoyas, máximo 4, copiados exactamente.

Usa solo los datos que te damos. Español neutro, frases cortas, sin markdown. Los ids van solo en "cited": en el texto nombra al autor o la red ("un video de Peter Diamandis en YouTube"), nunca un id.`;

const FIT_SYSTEM = `Evalúas si un tema de IA le sirve a la audiencia de 30X: fundadores, ejecutivos y equipos comerciales y de crecimiento en Latinoamérica que aprenden IA para aplicarla en su negocio. 30X tiene programas de Ventas, Growth, Inteligencia Artificial y Next (carrera y futuro del trabajo), y su tono es ambicioso y práctico ("construir ventajas injustas").

Puntúa de 1 a 10:
- score: encaje general con esa audiencia.
- executive: relevancia para decisiones de negocio (10 = un CEO lo necesita saber).
- noCode: qué tanto se aplica sin programar (10 = cualquier equipo lo usa mañana).
- latam: si hay ángulo latinoamericano o en español (casos, empresas, regulación, idioma).
Además:
- pillar: el programa de 30X que mejor lo cuenta.
- hypeRisk: bajo, medio o alto: riesgo de que sea humo o polémica que no le conviene a la marca.
- reasons: 2 o 3 razones cortas (máximo 14 palabras cada una).

Un tema muy técnico (cuantización, kernels, benchmarks) puntúa bajo aunque crezca mucho. Un tema de uso en ventas, marketing, productividad o estrategia puntúa alto.`;

async function stored<T>(
  deps: Deps,
  topicId: string,
  week: string,
  kind: string,
): Promise<T | null> {
  const [row] = await deps.db
    .select({ payload: analyses.payload })
    .from(analyses)
    .where(and(eq(analyses.topicId, topicId), eq(analyses.week, week), eq(analyses.kind, kind)));
  return (row?.payload as T | undefined) ?? null;
}

async function store(deps: Deps, topicId: string, week: string, kind: string, payload: unknown) {
  const row = { topicId, week, kind, payload, createdAt: deps.clock.now().toISOString() };
  await deps.db
    .insert(analyses)
    .values(row)
    .onConflictDoUpdate({ target: [analyses.topicId, analyses.week, analyses.kind], set: row });
}

export interface WhyInput {
  topicId: string;
  week: string;
  name: string;
  definition: string | null;
  stage: string;
  growthPct: number;
  creators: number;
  patterns: string[];
  evidence: { id: string; line: string }[];
}

export async function whyOf(deps: Deps, input: WhyInput, refresh = false): Promise<Why | null> {
  if (!refresh) {
    const cached = await stored<Why>(deps, input.topicId, input.week, 'why');
    if (cached) return cached;
  }
  const user = [
    `Tema: ${input.name}${input.definition ? ` — ${input.definition}` : ''}`,
    `Etapa: ${input.stage}; crecimiento ${input.growthPct >= 0 ? '+' : ''}${input.growthPct} % en creadores distintos frente a las 4 semanas anteriores; ${input.creators} creadores esta semana.`,
    '',
    'Patrones entre las piezas que despegaron:',
    ...(input.patterns.length
      ? input.patterns.map((p) => `- ${p}`)
      : ['- (no hay patrones con al menos 3 piezas)']),
    '',
    'Piezas de evidencia:',
    ...input.evidence.map((e) => `- [${e.id}] ${e.line}`),
  ].join('\n');
  try {
    const why = await deps.llm.complete({
      name: 'why',
      system: WHY_SYSTEM,
      user,
      schema: WhySchema,
      maxTokens: 6000,
      reasoningEffort: 'low',
    });
    const ids = new Set(input.evidence.map((e) => e.id));
    const clean = { ...why, cited: why.cited.filter((id) => ids.has(id)).slice(0, 4) };
    await store(deps, input.topicId, input.week, 'why', clean);
    return clean;
  } catch (error) {
    console.error('why:', (error as Error).message);
    return null;
  }
}

export async function fitOf(
  deps: Deps,
  input: {
    topicId: string;
    week: string;
    name: string;
    definition: string | null;
    samples: string[];
  },
  refresh = false,
): Promise<Fit | null> {
  if (!refresh) {
    const cached = await stored<Fit>(deps, input.topicId, input.week, 'fit');
    if (cached) return cached;
  }
  const user = [
    `Tema: ${input.name}${input.definition ? ` — ${input.definition}` : ''}`,
    'Piezas que hablan del tema:',
    ...input.samples.map((s) => `- ${s}`),
  ].join('\n');
  try {
    const fit = await deps.llm.complete({
      name: 'fit',
      system: FIT_SYSTEM,
      user,
      schema: FitSchema,
      maxTokens: 4000,
      reasoningEffort: 'low',
    });
    await store(deps, input.topicId, input.week, 'fit', fit);
    return fit;
  } catch (error) {
    console.error('fit:', (error as Error).message);
    return null;
  }
}
