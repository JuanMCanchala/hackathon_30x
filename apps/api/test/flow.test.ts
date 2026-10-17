import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import type { RawItem } from '@radar/core';
import { createApp } from '../src/http/app';
import type { Llm, RecordedRequest } from '../src/llm/cached';
import { approve, adaptTopic, calendar } from '../src/services/adapt';
import { clusterLabels, nameTopics } from '../src/pipeline/cluster';
import { enrichPending } from '../src/pipeline/enrich';
import { saveItems } from '../src/pipeline/ingest';
import { radar } from '../src/services/radar';
import { topicDetail } from '../src/services/topic';
import { testContainer } from './helpers';

const NOW = '2026-10-17T18:00:00Z';
const day = (daysAgo: number, hour = 14) =>
  new Date(Date.parse(NOW) - daysAgo * 86_400_000 + (hour - 18) * 3_600_000).toISOString();

function post(id: string, author: string, text: string, daysAgo: number, likes: number): RawItem {
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
function scriptedLlm(): Llm {
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

async function seeded() {
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

describe('the radar, from pieces to the calendar', () => {
  it('ranks the topic that took off above the one that stays flat', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const [first] = week.topics;
    expect(first?.name).toBe('Sora 2');
    expect(first?.growthPct).toBeGreaterThan(100);
    expect(['emergente', 'crecimiento']).toContain(first?.stage);
    const excel = week.topics.find((t) => t.name === 'Excel con IA');
    expect(excel === undefined || excel.momentum < first!.momentum).toBe(true);
    expect(week.basis.creators).toBeGreaterThan(10);
  });

  it('explains the topic, adapts it and puts an approved piece on the calendar', async () => {
    const deps = await seeded();
    const week = await radar(deps, { platform: 'all', region: 'global', untouched: false });
    const id = week.topics[0]!.id;
    const detail = await topicDetail(deps, id);
    expect(detail.topic.why).toContain('Sora 2');
    expect(detail.fit?.score).toBe(8);
    expect(detail.evidence.length).toBeGreaterThan(0);
    const adaptation = await adaptTopic(deps, id);
    const entry = await approve(deps, {
      adaptationId: adaptation.id,
      format: 'linkedin',
      scheduledFor: '2026-10-20',
      approvedBy: 'Equipo de medios 30X',
    });
    expect(entry.format).toBe('Post de LinkedIn');
    expect((await calendar(deps)).map((e) => e.topicName)).toEqual(['Sora 2']);
  });

  it('serves the week over HTTP', async () => {
    const deps = await seeded();
    const res = await createApp(deps).request('/api/v1/radar?platform=all&audience=all');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { topics: { name: string }[] };
    expect(body.topics[0]?.name).toBe('Sora 2');
  });
});
