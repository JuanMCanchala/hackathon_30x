/** A small week shared by the API tests: one topic takes off, one stays flat. */
import type { z } from 'zod';
import type { RawItem } from '@radar/core';
import type { Llm, RecordedRequest } from '../src/llm/cached';
import { clusterLabels, nameTopics } from '../src/pipeline/cluster';
import { enrichPending } from '../src/pipeline/enrich';
import { saveItems } from '../src/pipeline/ingest';
import { testContainer } from './helpers';

export const NOW = '2026-10-17T18:00:00Z';
const day = (daysAgo: number, hour = 14) =>
  new Date(Date.parse(NOW) - daysAgo * 86_400_000 + (hour - 18) * 3_600_000).toISOString();

export function post(
  id: string,
  author: string,
  text: string,
  daysAgo: number,
  likes: number,
): RawItem {
  return {
    platform: 'bluesky',
    source: 'bluesky-search',
    externalId: id,
    url: `https://bsky.app/profile/${author}/post/${id}`,
    author: { id: author, name: author, handle: author, followers: 5000 },
    publishedAt: day(daysAgo),
    text,
    format: 'post',
    lang: 'es',
    metrics: { likes, comments: Math.round(likes / 10) },
    capturedAt: NOW,
  };
}

/** A scripted model: it labels by keyword and answers every other request with fixed text. */
export function scriptedLlm(): Llm {
  return {
    async complete<T extends z.ZodType>(request: RecordedRequest<T>): Promise<z.infer<T>> {
      const answer = (() => {
        if (request.name === 'enrich' || request.name === 'enrich-light') {
          const pieces = [...request.user.matchAll(/^\[(\d+)\][^\n]*\n(.*)$/gm)].map((m) => {
            const text = m[2]!;
            const labels = /sora/i.test(text)
              ? ['Sora 2']
              : /excel/i.test(text)
                ? ['Excel con IA']
                : [];
            return {
              n: Number(m[1]),
              isAi: labels.length > 0,
              labels,
              hookType: /\d/.test(text) ? 'cifra' : 'opinion',
              hook: text.slice(0, 60),
              emotion: 'asombro',
              audience: 'ejecutivo',
              authorType: 'creador',
              useCase: 'marketing',
              lang: 'es',
              country: null,
            };
          });
          return { pieces };
        }
        if (request.name === 'name-topics') {
          const ids = [...request.user.matchAll(/^id: (\S+)/gm)].map((m) => m[1]!);
          return {
            topics: ids.map((id) => ({
              id,
              name: request.user.includes('sora') ? 'Sora 2' : 'Excel con IA',
              definition: 'Un tema de prueba.',
              wikipedia: null,
              queries: ['sora 2'],
              generic: false,
            })),
          };
        }
        if (request.name === 'headline') return { headline: 'Esta semana crece Sora 2' };
        if (request.name === 'why')
          return {
            oneLiner: 'OpenAI abrió Sora 2 y los creadores lo prueban.',
            narrative: 'Abren con una cifra.',
            cited: [],
          };
        if (request.name === 'fit')
          return {
            score: 8,
            executive: 7,
            noCode: 9,
            latam: 6,
            pillar: 'Growth',
            hypeRisk: 'medio',
            reasons: ['Sirve para marketing.'],
          };
        if (request.name === 'adapt')
          return {
            angle: 'Video con IA para vender más en LatAm.',
            hooks: [
              '1 video, 3 minutos',
              '¿Y si tu equipo no grabara más?',
              'El video ya no es caro',
            ],
            linkedin: 'Post de prueba.',
            carousel: [{ title: 'Uno', body: 'Texto' }],
            reel: { hook: 'Gancho', beats: ['Uno'], onScreen: ['Texto'], cta: 'Prueba hoy' },
            youtube: { title: 'Título', thumbnail: 'Miniatura' },
            avoid: ['El hype'],
            inspiredBy: [],
          };
        throw new Error(`Petición inesperada: ${request.name}`);
      })();
      return request.schema.parse(answer);
    },
  };
}

export async function seeded() {
  const { deps } = await testContainer({ now: NOW });
  deps.llm = scriptedLlm();
  const raws: RawItem[] = [];
  // Sora 2: one voice a week for a month, then twelve this week.
  for (let w = 1; w <= 5; w++) raws.push(post(`s${w}`, `early${w}`, 'Probé Sora 2', w * 7 + 2, 10));
  for (let i = 0; i < 12; i++)
    raws.push(
      post(
        `n${i}`,
        `creator${i}`,
        `Sora 2 genera 3 videos en 1 minuto (${i})`,
        1 + (i % 5),
        40 + i * 30,
      ),
    );
  // Excel con IA: five voices every week, steady.
  for (let w = 0; w <= 6; w++)
    for (let i = 0; i < 5; i++)
      raws.push(post(`e${w}-${i}`, `excel${i}`, 'Fórmulas de Excel con IA', w * 7 + 2, 20));
  await saveItems(deps, raws);
  await enrichPending(deps);
  await clusterLabels(deps);
  await nameTopics(deps);
  return deps;
}
