import { describe, expect, it } from 'vitest';
import { rankTopics, type Platform, type RadarPiece } from '../src';

const AS_OF = '2026-10-19T15:00:00.000Z';
const DAY = 86_400_000;

/** `perWeek[k]` creators publish in week k (oldest first) of the 12 weeks before AS_OF. */
function pieces(
  prefix: string,
  perWeek: number[],
  platform: Platform = 'linkedin',
  engagement: (k: number) => number = () => 10,
): RadarPiece[] {
  const out: RadarPiece[] = [];
  perWeek.forEach((count, k) => {
    const weeksAgo = perWeek.length - 1 - k;
    for (let i = 0; i < count; i += 1) {
      out.push({
        platform,
        authorId: `${prefix}-${k}-${i}`,
        publishedAt: new Date(Date.parse(AS_OF) - weeksAgo * 7 * DAY - 2 * DAY).toISOString(),
        engagement: engagement(k),
      });
    }
  });
  return out;
}

describe('rankTopics', () => {
  const topics = [
    {
      id: 'rising',
      label: 'Agentes que venden',
      fit: 9,
      pieces: pieces('r', [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 3, 30]),
    },
    {
      id: 'steady',
      label: 'Prompts',
      fit: 6,
      pieces: pieces('s', [8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8]),
    },
    {
      id: 'falling',
      label: 'Metaverso',
      fit: 3,
      pieces: pieces('f', [9, 9, 9, 9, 9, 9, 9, 9, 9, 6, 4, 2], 'linkedin', (k) => 120 - k * 8),
    },
    {
      id: 'forming',
      label: 'Un repo nuevo',
      fit: 7,
      pieces: [
        ...pieces('h', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 6], 'hn'),
        ...pieces('g', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2], 'github'),
      ],
    },
  ];
  const radar = rankTopics(topics, { asOf: AS_OF });

  it('reads rolling windows that end at asOf', () => {
    expect(radar.windows).toHaveLength(12);
    expect(radar.windows.at(-1)!.end).toBe(AS_OF);
  });

  it('ranks the topics that grow, highest momentum first', () => {
    expect(radar.top.map((t) => t.id)).toEqual(['rising', 'forming']);
    const rising = radar.top[0]!;
    expect(rising).toMatchObject({ creators: 30, signal: true, fit: 9, platforms: ['linkedin'] });
    expect(rising.growthPct).toBe(Math.round(((30 + 1) / ((2 + 2 + 2 + 3) / 4 + 1) - 1) * 100));
    expect(rising.sparkline).toEqual([1, 1, 1, 2, 2, 2, 3, 30]);
    expect(rising.series).toHaveLength(12);
  });

  it('gives each topic its Poisson burst p next to the lift', () => {
    const byId = new Map(radar.all.map((t) => [t.id, t]));
    // 30 voices where 2.25 were usual: far beyond noise. A flat 8 is about a coin flip.
    expect(byId.get('rising')!.burstP).toBeLessThan(1e-15);
    expect(byId.get('steady')!.burstP).toBeGreaterThan(0.4);
  });

  it('keeps flat and falling topics out of the top, with their stage', () => {
    const byId = new Map(radar.all.map((t) => [t.id, t]));
    expect(byId.get('steady')!.momentum).toBe(0);
    expect(byId.get('falling')!.stage).toBe('declining');
    expect(byId.get('falling')!.timingLabel).toBe('No entres');
  });

  it('flags what forms in the technical lane before LinkedIn and Instagram', () => {
    expect(radar.forming.map((t) => t.id)).toEqual(['forming']);
    const forming = radar.forming[0]!;
    expect(forming.arrivalCreators).toBe(0);
    expect(forming.technicalLift).toBeGreaterThan(1.8);
  });
});
