/**
 * Spanish versions of what worked in English and Portuguese: the content team reads the
 * original's idea in its own language before adapting it. One batched, recorded call.
 */
import { z } from 'zod';
import type { Deps } from './deps';

const TranslationSchema = z.object({
  items: z.array(z.object({ id: z.string(), es: z.string() })),
});

const SYSTEM = `Traduces al español latinoamericano ganchos y titulares de piezas sobre IA, para que un equipo de contenido entienda la idea original. Traduce el sentido, no palabra por palabra; conserva cifras, nombres propios y el tono. Máximo 160 caracteres por traducción. Devuelve cada id con su traducción.`;

export async function toSpanish(
  deps: Deps,
  pieces: { id: string; text: string }[],
  /** Names the recordings, so a feature's cost can be told apart. */
  name = 'translate',
): Promise<Map<string, string>> {
  if (!pieces.length) return new Map();
  const user = pieces
    .map((p) => `[${p.id}] ${p.text.replace(/\s+/g, ' ').slice(0, 280)}`)
    .join('\n');
  try {
    const result = await deps.llm.complete({
      name,
      system: SYSTEM,
      user,
      schema: TranslationSchema,
      maxTokens: 4000,
      reasoningEffort: 'none',
    });
    const ids = new Set(pieces.map((p) => p.id));
    return new Map(result.items.filter((i) => ids.has(i.id)).map((i) => [i.id, i.es]));
  } catch (error) {
    console.error('translate:', (error as Error).message);
    return new Map();
  }
}
